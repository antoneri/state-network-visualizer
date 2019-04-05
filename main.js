const url = new URL(window.location.href);
const net = url.searchParams.get("net");

const filename = net || "states.net";

fetch(filename)
  .then(res => res.text())
  .then(text => run(text));

const parse = (net) => {
  const nodes = [];
  const states = [];
  const links = [];

  const lines = net.split("\n")
    .filter(line => !line.startsWith("#"));

  let context = "";

  for (let line of lines) {
    if (line.startsWith("*")) {
      context = line.toLowerCase();
      continue;
    }

    if (context === "*vertices") {
      let [id, name] = line.split(" ");
      id = +id;
      name = name.replace(/^"|"$/g, "");
      nodes.push({ id, name, states: [] });
    } else if (context === "*states") {
      let [id, phys_id, name] = line.split(" ");
      id = +id;
      phys_id = +phys_id;
      name = name.replace(/^"|"$/g, "");
      let node = nodes.find(node => node.id === phys_id);
      let state = { id, node, name };
      node.states.push(state);
      states.push(state);
    } else if (context === "*links") {
      let [source, target, weight] = line.split(" ");
      source = states.find(state => state.id === +source);
      target = states.find(state => state.id === +target);
      weight = +weight;
      links.push({ source, target, weight });
    }
  }

  return { nodes, states, links };
};

const draw = (net) => {
  const { nodes, states, links } = net;

  const phys_links = links.map(({ source, target, weight }) => ({
    source: source.node,
    target: target.node,
    weight,
  }));

  const { innerWidth, innerHeight } = window;

  const simulation = d3.forceSimulation(nodes)
    .force("center", d3.forceCenter(innerWidth / 2, innerHeight / 2))
    .force("collide", d3.forceCollide(100))
    .force("charge", d3.forceManyBody().strength(-1000))
    .force("link", d3.forceLink(phys_links).distance(200));

  nodes.forEach(node =>
    node.simulation = d3.forceSimulation(node.states)
      .force("collide", d3.forceCollide(20))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("radial", d3.forceRadial(25).strength(0.5)));

  function dragstarted(d) {
    if (!d3.event.active) {
      simulation.alphaTarget(0.3).restart();
      nodes.forEach(node => node.simulation.alphaTarget(0.5).restart());
    }
    d.fx = d.x;
    d.fy = d.y;

    d.states.forEach(state => {
      state.fx = state.x;
      state.fy = state.y;
    });
  }

  function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;

    d.states.forEach(state => {
      state.fx += d3.event.dx;
      state.fy += d3.event.dy;
    });
  }

  function dragended(d) {
    if (!d3.event.active) {
      simulation.alphaTarget(0);
      nodes.forEach(node => node.simulation.alphaTarget(0));
    }
    d.fx = null;
    d.fy = null;

    d.states.forEach(state => {
      state.fx = null;
      state.fy = null;
    });
  }

  function statedragstarted(d) {
    if (!d3.event.active) {
      simulation.alphaTarget(0.3).restart();
      d.node.simulation.alphaTarget(0.5).restart();
    }
    d.fx = d.x;
    d.fy = d.y;
  }

  function statedragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function statedragended(d) {
    if (!d3.event.active) {
      simulation.alphaTarget(0);
      d.node.simulation.alphaTarget(0);
    }
    d.fx = null;
    d.fy = null;
  }

  const zoom = d3.zoom().scaleExtent([0.1, 1000]);

  const svg = d3.select("#state-network")
    .call(zoom)
    .call(zoom.transform, d3.zoomIdentity)
    .append("g")
    .attr("id", "zoomable")
    .attr("transform", d3.zoomIdentity);

  zoom.on("zoom", () => svg.attr("transform", d3.event.transform));

  let node = svg.selectAll(".node").data(nodes);

  node.exit().remove();

  node = node.enter()
    .append("g")
    .attr("class", "node")
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended))
    .merge(node);

  node.append("circle")
    .attr("r", 50)
    .attr("fill", "#fafafa")
    .attr("stroke", "#888");

  node.append("text")
    .text(d => d.name)
    .attr("text-anchor", "middle")
    .attr("dy", 12)
    .style("font-style", "italic")
    .style("font-size", 40);

  let link = svg.selectAll(".link").data(links);

  link.exit().remove();

  link = link.enter()
    .append("line")
    .attr("class", "link")
    .attr("opacity", 0.8)
    .attr("stroke", "#000")
    .attr("stroke-width", d => d.weight * 0.5)
    .merge(link);

  let state = svg.selectAll(".state").data(states);

  state.exit().remove();

  const setColor = color => function (d) {
    d3.select(this).select("circle").attr("stroke", color);
    link.filter(link => link.source === d || link.target === d)
      .attr("stroke", color);
  };

  state = state.enter()
    .append("g")
    .attr("class", "state")
    .on("mouseover", setColor("#f00"))
    .on("mouseout", setColor("#000"))
    .call(d3.drag()
      .on("start", statedragstarted)
      .on("drag", statedragged)
      .on("end", statedragended))
    .merge(state);

  state.append("circle")
    .attr("r", 15)
    .attr("fill", "#fff")
    .attr("stroke", "#000")
    .attr("opacity", 0.9);

  state.append("text")
    .text(d => d.id)
    .attr("text-anchor", "middle")
    .attr("dy", 5)
    .style("font-style", "italic")
    .style("font-size", 15);

  simulation.on("tick", () => {
    node.each(d => d.simulation.force("radial").x(d.x).y(d.y));

    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    state.select("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    state.select("text")
      .attr("x", d => d.x)
      .attr("y", d => d.y);

    node.select("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    node.select("text")
      .attr("x", d => d.x)
      .attr("y", d => d.y);
  });
};

const run = (text) => {
  const net = parse(text);
  draw(net);
};

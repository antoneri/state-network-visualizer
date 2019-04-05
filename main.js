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
      const [_, id, name] = line.match(/(\d+) "(.+)"/);
      nodes.push({ id: +id, name, states: [] });
    } else if (context === "*states") {
      const [_, id, phys_id, name] = line.match(/(\d+) (\d+) "(.+)"/);
      const node = nodes.find(node => node.id === +phys_id);
      if (!node) {
        throw new Error("No physical node found!");
      }
      const state = { id: +id, node, name };
      node.states.push(state);
      states.push(state);
    } else if (context === "*links") {
      const [_, source_id, target_id, weight] = line.match(/(\d+) (\d+) ([\d\.]+)/);
      const source = states.find(state => state.id === +source_id);
      const target = states.find(state => state.id === +target_id);
      if (!(source && target)) {
        throw new Error("Source or target state not found!");
      }
      links.push({ source, target, weight: +weight });
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

  const defs = d3.select("#state-network").append("defs");

  defs.selectAll("marker")
    .data(["black", "red"])
    .enter()
    .append("marker")
    .attr("id", d => `arrow_${d}`)
    .attr("markerHeight", 5)
    .attr("markerWidth", 5)
    .attr("orient", "auto")
    .attr("refX", 3)
    .attr("viewBox", "-5 -5 10 10")
    .append("path")
    .attr("d", "M 0,0 m -5,-5 L 5,0 L -5,5 Z")
    .attr("fill", d => d);

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
    .attr("stroke", "#888")
    .append("title")
    .text(d => d.name);

  node.append("text")
    .text(d => d.id)
    .attr("text-anchor", "middle")
    .attr("fill", "#999")
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
    .attr("marker-end", "url(#arrow_black)")
    .merge(link);

  let state = svg.selectAll(".state").data(states);

  state.exit().remove();

  const setColor = color => function (d) {
    d3.select(this).select("circle").attr("stroke", color);
    link.filter(link => link.source === d || link.target === d)
      .attr("stroke", color)
      .attr("marker-end", `url(#arrow_${color})`);
  };

  state = state.enter()
    .append("g")
    .attr("class", "state")
    .on("mouseover", setColor("red"))
    .on("mouseout", setColor("black"))
    .call(d3.drag()
      .on("start", statedragstarted)
      .on("drag", statedragged)
      .on("end", statedragended))
    .merge(state);

  state.append("circle")
    .attr("r", 15)
    .attr("fill", "#fff")
    .attr("stroke", "#000")
    .attr("opacity", 0.9)
    .append("title")
    .text(d => d.name);

  state.append("text")
    .text(d => d.id)
    .attr("text-anchor", "middle")
    .attr("dy", 5)
    .style("font-style", "italic")
    .style("font-size", 15);

  const drawLink = r => function (d) {
    const x1 = d.source.x || 0;
    const y1 = d.source.y || 0;
    const x2 = d.target.x || 0;
    const y2 = d.target.y || 0;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    const dir = { x: dx / l, y: dy / l };

    d3.select(this)
      .attr("x1", x1 + r * dir.x)
      .attr("y1", y1 + r * dir.y)
      .attr("x2", x2 - r * dir.x)
      .attr("y2", y2 - r * dir.y);
  };

  simulation.on("tick", () => {
    node.each(d => d.simulation.force("radial").x(d.x).y(d.y));

    link
      .each(drawLink(15));

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

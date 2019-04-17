const url = new URL(window.location.href);
const net = url.searchParams.get("net");
const filename = net || "example.net";

let treename = filename;
if (filename.lastIndexOf(".") !== -1) {
  treename = treename.substring(0, treename.lastIndexOf("."));
}
treename += "_states.tree";

const fetchText = filename =>
  fetch(filename)
    .then(res => {
      if (!res.ok) {
        throw Error(res.statusText);
      }
      return res;
    })
    .then(res => res.text())
    .catch(err => console.log(err));

fetchText(filename)
  .then(async (net) => {
    const tree = await fetchText(treename);
    draw(parseNet(net), tree ? parseTree(tree) : null);
  });

function parseNet(net) {
  const nodes = [];
  const states = [];
  const links = [];

  let context = "";

  net.split("\n")
    .filter(line => !line.startsWith("#"))
    .forEach((line) => {
      if (line.startsWith("*")) {
        context = line.toLowerCase();
      } else if (context === "*vertices") {
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
    });

  return { nodes, states, links };
}

function parseTree(tree) {
  const result = [];

  tree.split("\n")
    .forEach((line) => {
      const match = line.match(/^(\d[:\d]+) (\d[\.\d]*) \"(\w+)\" (\d+)(?: (\d+))?$/);
      if (match) {
        const [_, path, flow, name, id, physId] = match;
        result.push({
          path: path.split(":").map(Number),
          flow: +flow,
          name,
          id: physId ? +physId : +id,
          stateId: physId ? +id : null,
        });
      }
    });

  return result;
}

function draw(net, tree = null) {
  const { nodes, states, links } = net;
  const { innerWidth, innerHeight } = window;
  const nodeRadius = 50;
  const stateRadius = 15;

  const treeById = new Map();
  if (tree) {
    tree.filter(node => node.stateId)
      .forEach(node => treeById.set(node.stateId, node));
  }

  const phys_links = links.map(({ source, target, weight }) => ({
    source: source.node,
    target: target.node,
    weight,
  }));

  const simulation = d3.forceSimulation(nodes)
    .force("center", d3.forceCenter(innerWidth / 2, innerHeight / 2))
    .force("collide", d3.forceCollide(2 * nodeRadius))
    .force("charge", d3.forceManyBody().strength(-1000))
    .force("link", d3.forceLink(phys_links).distance(200));

  const stateSimulation = d3.forceSimulation(states)
    .force("collide", d3.forceCollide(4 / 3 * stateRadius))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("link", d3.forceLink(links).distance(200))
    .force("radial", d3.forceRadial(nodeRadius / 2, d => d.node.x, d => d.node.y).strength(0.8));

  const dragHelper = {
    start: d => {
      d.fx = d.x;
      d.fy = d.y;
    },
    drag: d => {
      d.fx += d3.event.dx;
      d.fy += d3.event.dy;
    },
    stop: d => {
      d.fx = null;
      d.fy = null;
    },
    setAlphaTarget: (alphaTarget = 0, stateAlphaTarget = 0) => {
      if (!d3.event.active) {
        simulation.alphaTarget(alphaTarget).restart();
        stateSimulation.alphaTarget(stateAlphaTarget).restart();
      }
    },
  };

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
      .on("start", d => {
        dragHelper.setAlphaTarget(0.3, 0.8);
        dragHelper.start(d);
        d.states.forEach(dragHelper.start);
      })
      .on("drag", d => {
        dragHelper.drag(d);
        d.states.forEach(dragHelper.drag);
      })
      .on("end", d => {
        dragHelper.setAlphaTarget();
        dragHelper.stop(d);
        d.states.forEach(dragHelper.stop);
      }))
    .merge(node);

  node.append("circle")
    .attr("r", nodeRadius)
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
    .attr("stroke-width", d => d.weight)
    .attr("marker-end", "url(#arrow_black)")
    .merge(link);

  let state = svg.selectAll(".state").data(states);

  state.exit().remove();

  const setColor = color => function (d) {
    const circle = d3.select(this).select("circle");
    if (circle.attr("stroke") === color) return;
    circle.attr("stroke", color);
    const targetNodes = new Set();
    link
      .filter(link => link.source === d)
      .attr("stroke", color)
      .attr("marker-end", `url(#arrow_${color})`)
      .each(link => targetNodes.add(link.target));
    state
      .select(function (d) { return targetNodes.has(d) ? this : null; })
      .each(setColor(color));
  };

  state = state.enter()
    .append("g")
    .attr("class", "state")
    .on("mouseover", setColor("red"))
    .on("mouseout", setColor("black"))
    .call(d3.drag()
      .on("start", d => {
        dragHelper.setAlphaTarget(0.01, 0.5);
        dragHelper.start(d);
      })
      .on("drag", dragHelper.drag)
      .on("end", d => {
        dragHelper.setAlphaTarget();
        dragHelper.stop(d);
      }))
    .merge(state);

  const colorSchemes = {
    1: d3.schemeBuPu[9],
    2: d3.schemeOrRd[9],
    3: d3.schemeYlGn[9],
    4: d3.schemeGreys[9],
  };

  const numColors = Object.keys(colorSchemes).length;

  state.append("circle")
    .attr("r", stateRadius)
    .attr("fill", d => {
      if (!tree || !treeById.has(d.id)) return "#fff";
      const path = treeById.get(d.id).path;
      const scheme = colorSchemes[Math.min(path[0], numColors)];
      return scheme[path.length > 2 ? (2 + path[1]) % scheme.length : 2];
    })
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
    stateSimulation.force("radial")
      .x(d => d.node.x)
      .y(d => d.node.y);

    link
      .each(drawLink(stateRadius));

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
}

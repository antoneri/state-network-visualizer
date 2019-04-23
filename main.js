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
  const nodesById = new Map();
  const statesById = new Map();
  const links = [];

  let context = "";

  net.split("\n")
    .filter(line => !line.startsWith("#"))
    .filter(Boolean)
    .forEach((line) => {
      if (line.startsWith("*")) {
        const match = line.match(/^\*(vertices|states|links)/i);
        context = match ? match[1].toLowerCase() : "";
      } else if (context === "vertices") {
        const match = line.match(/(\d+) "(.+)"/);
        if (match) {
          const [_, id, name] = match;
          const node = { id: +id, name, states: [] };
          nodesById.set(id, node);
        }
      } else if (context === "states") {
        const match = line.match(/(\d+) (\d+) "(.+)"/);
        if (match) {
          const [_, id, physId, name] = match;
          const node = nodesById.get(physId);
          if (!node) {
            throw new Error(`No physical node with id ${physId} found!`);
          }
          const state = { id: +id, node, name, links: [] };
          statesById.set(id, state);
          node.states.push(state);
        }
      } else if (context === "links") {
        const match = line.match(/(\d+) (\d+) (\d(?:\.\d+)?)/);
        if (match) {
          const [_, sourceId, targetId, weight] = match;
          const source = statesById.get(sourceId);
          const target = statesById.get(targetId);
          if (!(source && target)) {
            throw new Error("Source or target state not found!");
          }
          const link = { source, target, weight: +weight };
          source.links.push(link);
          links.push(link);
        }
      }
    });

  return {
    nodes: Array.from(nodesById.values()),
    states: Array.from(statesById.values()),
    links,
  };
}

function parseTree(tree) {
  const result = {
    codelength: null,
    nodes: [],
  };

  tree.split("\n")
    .filter(Boolean)
    .forEach((line) => {
      if (!result.codelength) {
        const codelengthMatch = line.match(/^#\s?codelength.*?(\d(?:\.\d+)?)/i);
        if (codelengthMatch) {
          result.codelength = +codelengthMatch[1];
        }
      }
      const match = line.match(/(\d(?::\d)+) (\d(?:\.\d+)?) "(.+)" (\d+)(?: (\d+))?/);
      if (match) {
        const [_, path, flow, name, id, physId] = match;
        result.nodes.push({
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

function entropyRate({ states, links }) {
  const entropy = p => -p * Math.log2(p);

  const H = states.reduce((H, state) => {
    const weights = state.links.map(link => link.weight);
    const outWeight = weights.reduce((a, b) => a + b, 0);
    const h = weights
      .map(weight => entropy(weight / outWeight))
      .reduce((a, b) => a + b, 0);
    return H + h * outWeight;
  }, 0);

  const totWeight = links
    .map(link => link.weight)
    .reduce((a, b) => a + b, 0);
  return H / totWeight;
}

function aggregatePhysLinks(stateLinks) {
  const physLinks = stateLinks.map(({ source, target, weight }) => ({
    source: source.node,
    target: target.node,
    weight,
  }));

  const linkSources = new Map();

  physLinks.forEach(link => {
    if (!linkSources.has(link.source)) {
      linkSources.set(link.source, new Map());
    }
    const targets = linkSources.get(link.source);
    const weight = targets.get(link.target) || 0;
    targets.set(link.target, weight + link.weight);
  });

  const aggregatedPhysLinks = [];

  for (let [source, targets] of linkSources) {
    for (let [target, weight] of targets) {
      aggregatedPhysLinks.push({ source, target, weight });
    }
  }

  return aggregatedPhysLinks;
}

function draw(net, tree = null) {
  const { nodes, states, links } = net;
  const { innerWidth, innerHeight } = window;
  const nodeRadius = 50;
  const stateRadius = 15;

  const pathById = new Map();
  if (tree) {
    tree.nodes.filter(node => node.stateId)
      .forEach(node => pathById.set(node.stateId, node.path));
  }

  const aggregatedPhysLinks = aggregatePhysLinks(links);

  const simulation = d3.forceSimulation(nodes)
    .force("center", d3.forceCenter(innerWidth / 2, innerHeight / 2))
    .force("collide", d3.forceCollide(2 * nodeRadius))
    .force("charge", d3.forceManyBody().strength(-1000))
    .force("link", d3.forceLink(aggregatedPhysLinks).distance(200));

  const stateSimulation = d3.forceSimulation(states)
    .force("collide", d3.forceCollide(stateRadius))
    .force("charge", d3.forceManyBody().strength(-200).distanceMax(2 * nodeRadius))
    .force("link", d3.forceLink(links).distance(d => d.source.node === d.target.node ? 2 * nodeRadius : 200))
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
    .call(zoom.transform, d3.zoomIdentity);

  const zoomable = svg.append("g")
    .attr("id", "zoomable")
    .attr("transform", d3.zoomIdentity);

  zoom.on("zoom", () => zoomable.attr("transform", d3.event.transform));

  const entRate = entropyRate(net);
  svg
    .append("text")
    .text(`Entropy rate: ${entRate > 0 ? entRate.toFixed(4) : entRate}`)
    .attr("fill", "#444")
    .style("font-size", 14)
    .attr("x", 5)
    .attr("y", 14);

  if (tree && tree.codelength) {
    svg
      .append("text")
      .text(`Codelength: ${tree.codelength}`)
      .attr("fill", "#444")
      .style("font-size", 14)
      .attr("x", 5)
      .attr("y", 32);
  }

  let node = zoomable.selectAll(".node").data(nodes);

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

  let link = zoomable.selectAll(".link").data(links);

  link.exit().remove();

  link = link.enter()
    .append("line")
    .attr("class", "link")
    .attr("opacity", 1)
    .attr("stroke", "#000")
    .attr("stroke-width", d => d.weight)
    .attr("marker-end", "url(#arrow_black)")
    .merge(link);

  let state = zoomable.selectAll(".state").data(states);

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
      if (!tree || !pathById.has(d.id)) return "#fff";
      const path = pathById.get(d.id);
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
    const dx = x2 - x1 || 1e-6;
    const dy = y2 - y1 || 1e-6;
    const r = Math.sqrt(dx * dx + dy * dy);
    const dir = { x: dx / r, y: dy / r };

    d3.select(this)
      .attr("x1", x1 + r * dir.x)
      .attr("y1", y1 + r * dir.y)
      .attr("x2", x2 - r * dir.x)
      .attr("y2", y2 - r * dir.y);
  };

  simulation.on("tick", () => {
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

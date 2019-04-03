const net = '# physical nodes: 6\n' +
  '# state nodes: 8\n' +
  '# markov order: 3\n' +
  '*Vertices\n' +
  '1 "i"\n' +
  '2 "j"\n' +
  '3 "k"\n' +
  '4 "l"\n' +
  '5 "m"\n' +
  '6 "n"\n' +
  '*States\n' +
  '#state_id physical_id name\n' +
  '1 3 "3 3 3"\n' +
  '2 1 "3 3 1"\n' +
  '3 2 "3 1 2"\n' +
  '4 5 "1 2 5"\n' +
  '5 4 "4 4 4"\n' +
  '6 1 "4 4 1"\n' +
  '7 2 "4 1 2"\n' +
  '8 6 "1 2 6"\n' +
  '*Links\n' +
  '#source_id target_id weight\n' +
  '1 2 4.0\n' +
  '2 3 4.0\n' +
  '3 4 4.0\n' +
  '5 6 4.0\n' +
  '6 7 4.0\n' +
  '7 8 4.0\n' +
  '*Contexts\n' +
  '#state_id physical_id prior_id [history...] \n' +
  '1 3 3 3\n' +
  '2 1 3 3\n' +
  '3 2 1 3\n' +
  '4 5 2 1\n' +
  '5 4 4 4\n' +
  '6 1 4 4\n' +
  '7 2 1 4\n' +
  '8 6 2 1\n';

const nodes = [];
const states = [];
const links = [];

const lines = net.split("\n").filter(line => !line.startsWith("#"));

let context = null;

lines.forEach(line => {
  if (line.startsWith("*")) {
    context = line.toLowerCase();
  } else if (context === "*vertices") {
    let [id, name, ...rest] = line.split(" ");
    id = +id;
    name = name.replace(/^"|"$/g, "");
    nodes.push({ id, name, x: 0, y: 0, states: [] });
  } else if (context === "*states") {
    let [id, phys_id, name, ...rest] = line.split(" ");
    id = +id;
    phys_id = +phys_id;
    name = name.replace(/^"|"$/g, "");
    let node = nodes.find(node => node.id === phys_id);
    let state = { id, node, name, x: 0, y: 0 };
    node.states.push(state);
    states.push(state);
  } else if (context === "*links") {
    let [source, target, weight] = line.split(" ");
    source = states.find(state => state.id === +source);
    target = states.find(state => state.id === +target);
    weight = +weight;
    links.push({ source, target, weight });
  }
});

const phys_links = [].concat.apply([], links.map(({ source, target, weight }) => ({
  source: source.node,
  target: target.node,
  weight,
})));

function key(d) {
  return d ? d.id : this.id;
}

const zoom = d3.zoom().scaleExtent([0.1, 1000]);
const initialTransform = d3.zoomIdentity.translate(50, 50);

const svg = d3.select("#state-network")
  .call(zoom)
  .call(zoom.transform, initialTransform)
  .append("g")
  .attr("id", "zoomable")
  .attr("transform", initialTransform);

zoom.on("zoom", () => {
  svg.attr("transform", d3.event.transform);
});

let node = svg.selectAll(".node")
  .data(nodes, key);

node.exit().remove();

node = node.enter()
  .append("g")
  .attr("class", "node")
  .merge(node);

node.append("circle")
  .attr("r", 50)
  .attr("cx", d => d.x)
  .attr("cy", d => d.y)
  .attr("fill", "#fafafa")
  .attr("stroke", "#888");

node.append("text")
  .text(d => d.name)
  .attr("text-anchor", "middle")
  .attr("dy", 12)
  .style("font-style", "italic")
  .style("font-size", 40)
  .attr("x", d => d.x)
  .attr("y", d => d.y);

let link = svg.selectAll(".link").data(links, key);

link.exit().remove();

link = link.enter()
  .append("line")
  .attr("class", "link")
  .attr("x1", d => d.source.x)
  .attr("y1", d => d.source.y)
  .attr("x2", d => d.target.x)
  .attr("y2", d => d.target.y)
  .attr("opacity", 0.8)
  .attr("stroke", "#000")
  .attr("stroke-width", d => d.weight * 0.5)
  .merge(link);

let state = svg.selectAll(".state").data(states, key);

state.exit().remove();

state = state.enter()
  .append("g")
  .attr("class", "state")
  .on("mouseover", function (d) {
    link.filter(link => link.source === d || link.target === d)
      .attr("stroke", "red");
  })
  .on("mouseout", function (d) {
    link.filter(link => link.source === d || link.target === d)
      .attr("stroke", "black");
  })
  .merge(state);

state.append("circle")
  .attr("r", 15)
  .attr("cx", d => d.x)
  .attr("cy", d => d.y)
  .attr("fill", "#fff")
  .attr("stroke", "#000")
  .attr("opacity", 0.9);

state.append("text")
  .text(d => d.id)
  .attr("text-anchor", "middle")
  .attr("dy", 5)
  .style("font-style", "italic")
  .style("font-size", 15)
  .attr("x", d => d.x)
  .attr("y", d => d.y);

const simulation = d3.forceSimulation(nodes)
  .force("center", d3.forceCenter(300, 300))
  .force("collide", d3.forceCollide(100))
  .force("charge", d3.forceManyBody().strength(-1000))
  .force("link", d3.forceLink(phys_links).distance(200));

let forceX = d3.forceX(d => d.node.x);
let forceY = d3.forceY(d => d.node.y);

d3.forceSimulation(states)
  .force("collide", d3.forceCollide(20))
  .force("x", forceX.strength(.5))
  .force("y", forceY.strength(.5));

simulation.on("tick", () => {
  forceX.x(d => d.node.x);
  forceY.y(d => d.node.y);

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

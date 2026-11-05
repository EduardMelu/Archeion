// ELK runs away from the interaction thread.

import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { CachedLayout, Point } from "../logic/layoutPolicy";
import type { LayoutRequest, LayoutResponse } from "./client";

const elk = new ELK();

self.onmessage = async ({ data }: MessageEvent<LayoutRequest>) => {
  const input: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "1",
      "elk.spacing.nodeNode": "36",
      "elk.spacing.edgeEdge": "18",
      "elk.spacing.edgeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "104",
      "elk.layered.spacing.edgeNodeBetweenLayers": "28",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "18",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.thoroughness": "12",
      "elk.separateConnectedComponents": "false",
      // One way in and one way out per part: lines share a trunk and then branch, like a metro map.
      "elk.layered.mergeEdges": "true",
    },
    children: data.nodes.map((node) => ({ id: node.id, width: node.w, height: node.h })),
    edges: data.edges.map((edge) => ({ id: edge.key, sources: [edge.from], targets: [edge.to] })),
  };
  const result = await elk.layout(input);

  const layout: CachedLayout = {
    width: result.width ?? 0,
    height: result.height ?? 0,
    nodes: {},
    routes: {},
  };
  for (const child of result.children ?? []) {
    layout.nodes[child.id] = {
      x: child.x ?? 0,
      y: child.y ?? 0,
      w: child.width ?? 0,
      h: child.height ?? 0,
    };
  }
  for (const edge of (result.edges ?? []) as ElkExtendedEdge[]) {
    const section = edge.sections?.[0];
    if (!section) continue;
    const points: Point[] = [
      [section.startPoint.x, section.startPoint.y],
      ...(section.bendPoints ?? []).map((p): Point => [p.x, p.y]),
      [section.endPoint.x, section.endPoint.y],
    ];
    layout.routes[edge.id] = points;
  }
  const response: LayoutResponse = { id: data.id, layout };
  self.postMessage(response);
};

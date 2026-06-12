"use client";

import { useMemo } from "react";
import {
  sankey,
  sankeyLeft,
  sankeyLinkHorizontal,
  type SankeyLink,
  type SankeyNode,
} from "d3-sankey";
import type { FunnelStage } from "@/lib/queries";

interface NodeDatum {
  id: string;
  label: string;
  kind: "stage" | "drop";
}

interface LinkDatum {
  source: string;
  target: string;
  value: number;
  kind: "converted" | "dropped";
  /** Conversion share of the source stage, for the link label. */
  share: number;
}

type LaidOutNode = SankeyNode<NodeDatum, LinkDatum>;
type LaidOutLink = SankeyLink<NodeDatum, LinkDatum>;

const WIDTH = 760;
const HEIGHT = 360;
const STAGE_COLOR = "#178049";
const DROP_COLOR = "#8A918D";

const numberFmt = new Intl.NumberFormat("en-US");

/*
  Acquisition funnel as a Sankey: each stage splits into the next stage
  and a drop-off sink. Geometry comes from d3-sankey; the SVG scales via
  viewBox so no runtime measurement is needed.
*/
export function FunnelSankey({ stages }: { stages: FunnelStage[] }) {
  const layout = useMemo(() => {
    const nodes: NodeDatum[] = stages.map((s) => ({
      id: s.id,
      label: s.label,
      kind: "stage" as const,
    }));
    const links: LinkDatum[] = [];

    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1];
      const next = stages[i];
      if (prev.count <= 0) break;
      const dropped = prev.count - next.count;
      if (next.count > 0) {
        links.push({
          source: prev.id,
          target: next.id,
          value: next.count,
          kind: "converted",
          share: next.count / prev.count,
        });
      }
      if (dropped > 0) {
        nodes.push({
          id: `drop-${prev.id}`,
          label: i === 1 ? "No trial" : i === 2 ? "Did not activate" : "Did not convert",
          kind: "drop",
        });
        links.push({
          source: prev.id,
          target: `drop-${prev.id}`,
          value: dropped,
          kind: "dropped",
          share: dropped / prev.count,
        });
      }
    }

    const generator = sankey<NodeDatum, LinkDatum>()
      .nodeId((d) => d.id)
      .nodeAlign(sankeyLeft)
      .nodeWidth(14)
      .nodePadding(28)
      .nodeSort((a, b) => (a.kind === b.kind ? 0 : a.kind === "stage" ? -1 : 1))
      .extent([
        [0, 16],
        [WIDTH - 130, HEIGHT - 16],
      ]);

    return generator({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    });
  }, [stages]);

  const linkPath = sankeyLinkHorizontal<NodeDatum, LinkDatum>();

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label={`Acquisition funnel: ${stages
        .map((s) => `${s.label} ${numberFmt.format(s.count)}`)
        .join(", ")}`}
    >
      {(layout.links as LaidOutLink[]).map((link) => {
        const source = link.source as LaidOutNode;
        const target = link.target as LaidOutNode;
        const converted = link.kind === "converted";
        return (
          <g key={`${source.id}-${target.id}`}>
            <path
              d={linkPath(link) ?? undefined}
              fill="none"
              stroke={converted ? STAGE_COLOR : DROP_COLOR}
              strokeOpacity={converted ? 0.25 : 0.18}
              strokeWidth={Math.max(1, link.width ?? 1)}
            >
              <title>
                {`${source.label} to ${target.label}: ${numberFmt.format(link.value)} (${(link.share * 100).toFixed(1)}%)`}
              </title>
            </path>
            <text
              x={((source.x1 ?? 0) + (target.x0 ?? 0)) / 2}
              y={((link.y0 ?? 0) + (link.y1 ?? 0)) / 2 - 6}
              textAnchor="middle"
              className="fill-[#3A403D] text-[11px] font-medium"
            >
              {(link.share * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}

      {(layout.nodes as LaidOutNode[]).map((node) => {
        const stage = node.kind === "stage";
        const x0 = node.x0 ?? 0;
        const x1 = node.x1 ?? 0;
        const y0 = node.y0 ?? 0;
        const y1 = node.y1 ?? 0;
        const cy = (y0 + y1) / 2;
        return (
          <g key={node.id}>
            <rect
              x={x0}
              y={y0}
              width={x1 - x0}
              height={Math.max(2, y1 - y0)}
              rx={3}
              fill={stage ? STAGE_COLOR : DROP_COLOR}
              fillOpacity={stage ? 1 : 0.55}
            >
              <title>{`${node.label}: ${numberFmt.format(node.value ?? 0)}`}</title>
            </rect>
            <text
              x={x1 + 8}
              y={cy - 2}
              dominantBaseline="auto"
              className={
                stage
                  ? "fill-[#1F2421] text-[13px] font-semibold"
                  : "fill-[#3A403D] text-[12px]"
              }
            >
              {node.label}
            </text>
            <text
              x={x1 + 8}
              y={cy + 13}
              className="fill-[#3A403D] text-[12px]"
            >
              {numberFmt.format(node.value ?? 0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

"""Build the release bundle and the human-readable tree view.

Outputs:
    dist/kb-<version>.json   machine-readable bundle the product pins to
    INDEX.md                 tree view generated from the graph (do not edit by hand)
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict

from kblib import ROOT, Report, check_graph, load_meta, load_nodes

sys.stdout.reconfigure(encoding="utf-8")


def label(n: dict) -> str:
    return f"{n['name']['zh']}（`{n['id']}`）"


def evidence_summary(rel: dict) -> str:
    evs = rel.get("evidence", [])
    if not evs:
        return "**无证据**"
    return "，".join(f"{e['level']}·{e['stance']}" for e in evs)


def build_index(nodes: dict, meta: dict, incoming: dict) -> str:
    out: list[str] = []
    w = out.append
    by_type = defaultdict(list)
    for n in nodes.values():
        by_type[n["type"]].append(n)

    def rels(n, kind):
        return [r for r in n.get("relations", []) if r["type"] == kind]

    def parents_chain(nid):
        chain, cur = [], nid
        while True:
            ps = [r["target"] for r in rels(nodes[cur], "part_of")]
            if not ps or ps[0] in chain:
                return chain
            chain.append(ps[0])
            cur = ps[0]

    w(f"# 知识树\n\n> 由 `scripts/build.py` 自动生成，请勿手改。版本 {meta['version']}，共 {len(nodes)} 个节点。\n")

    # 1. goal-first view: what the product actually walks
    w("## 一、从用户目标出发\n")
    w("产品生成一次体验时走的就是这条路径：目标 → 叙事机制 → 背后的调节策略 → 理论构念 → 测量工具。\n")
    for g in sorted(by_type["goal"], key=lambda n: n["id"]):
        w(f"- **{label(g)}** [{g['status']}]")
        for t in rels(g, "targets"):
            w(f"  - 目标指向：{nodes[t['target']]['name']['zh']}")
        for m_id, r in sorted(incoming[g["id"]]["serves"]):
            m = nodes[m_id]
            w(f"  - 机制 {label(m)} [{m['status']}] ── 服务此目标的证据：{evidence_summary(r)}")
            for imp in rels(m, "implements"):
                chain = [imp["target"], *parents_chain(imp["target"])]
                path = " → ".join(nodes[c]["name"]["zh"] for c in chain)
                w(f"    - 实现策略：{path} ── 证据：{evidence_summary(imp)}")
        dm = g.get("product_use", {}).get("default_measure")
        if dm:
            w(f"  - 默认测量：{label(nodes[dm])}")
    w("")

    # 2. theory tree via part_of
    w("## 二、理论树（按 part_of 展开）\n")
    children = defaultdict(list)
    for n in nodes.values():
        for r in rels(n, "part_of"):
            children[r["target"]].append(n["id"])
    roots = [n["id"] for n in nodes.values()
             if n["type"] in ("construct", "strategy") and not rels(n, "part_of")]

    def walk(nid, depth):
        n = nodes[nid]
        measured = sorted(nodes[i]["name"]["zh"] for i, _ in incoming[nid]["measures"])
        suffix = f" ← 测量：{'、'.join(measured)}" if measured else ""
        w(f"{'  ' * depth}- {label(n)}{suffix}")
        for c in sorted(children[nid], key=lambda i: (nodes[i]["type"], i)):
            walk(c, depth + 1)

    for r in sorted(roots):
        walk(r, 0)
    w("")

    # 3. evidence gaps
    w("## 三、证据缺口\n")
    w("以下关系还没有直接测试过该机制本身的研究，只有类比或理论外推（`hypothesis`），或者完全没有文献。"
      "最需要的是直接检验这些机制的实验，包括产品自己的对照实验。\n")
    w("| 节点 | 关系 | 状态 | 类比证据 |\n|---|---|---|---|")
    for n in sorted(nodes.values(), key=lambda n: n["id"]):
        for r in n.get("relations", []):
            evs = r.get("evidence", [])
            if n["type"] == "mechanic" and (not evs or all(e["level"] == "hypothesis" for e in evs)):
                status = "无证据" if not evs else f"仅间接证据（{len(evs)} 条）"
                mixed = sum(e["stance"] != "supports" for e in evs)
                srcs = "、".join(e["source"].removeprefix("source.") for e in evs)
                w(f"| `{n['id']}` | {r['type']} → `{r['target']}` | {status}"
                  f"{f'，其中 {mixed} 条不一致' if mixed else ''} | {srcs} |")
    w("")

    # 4. instruments and licensing
    w("## 四、测量工具与许可\n")
    w("| 工具 | 题数 | 产品角色 | 许可 | 商用 |\n|---|---|---|---|---|")
    for n in sorted(by_type["instrument"], key=lambda n: n["id"]):
        inst = n["instrument"]
        lic = inst["license"]
        w(f"| {label(n)} | {inst['items']} | {n['product_use'].get('role', '')} | "
          f"{lic['status']} | {lic.get('commercial_use', 'unknown')} |")
    w("")

    # 5. sources
    w("## 五、文献\n")
    for s in sorted(by_type["source"], key=lambda n: (n["citation"]["authors"][0], n["citation"]["year"])):
        c = s["citation"]
        authors = c["authors"][0] + (" et al." if len(c["authors"]) > 2 else
                                     f" & {c['authors'][1]}" if len(c["authors"]) == 2 else "")
        doi = f" https://doi.org/{c['doi']}" if c.get("doi") else ""
        used_by = len(incoming[s["id"]]["cited_by"])
        w(f"- {authors} ({c['year']}). {c['title']}. *{c['venue']}*.{doi} ── 被 {used_by} 个节点引用")
    w("")
    return "\n".join(out)


def main() -> int:
    report = Report()
    nodes = load_nodes(report)
    check_graph(nodes, report)
    if report.errors:
        print("validation failed; run scripts/validate.py for details")
        return 1
    meta = load_meta()

    incoming: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    for n in nodes.values():
        for i, r in enumerate(n.get("relations", [])):
            incoming[r["target"]][r["type"]].add((n["id"], i))
            for e in r.get("evidence", []):
                incoming[e["source"]]["cited_by"].add((n["id"], -1))
        for c in n.get("claims", []):
            for e in c.get("evidence", []):
                incoming[e["source"]]["cited_by"].add((n["id"], -1))
    # resolve relation indices to relation dicts for the index view
    resolved = defaultdict(lambda: defaultdict(list))
    for target, kinds in incoming.items():
        for kind, pairs in kinds.items():
            for src, i in pairs:
                resolved[target][kind].append((src, nodes[src]["relations"][i] if i >= 0 else None))

    bundle = {
        "name": meta["name"],
        "version": meta["version"],
        "doi": meta.get("doi"),
        "license": meta["license"],
        "nodes": {nid: {k: v for k, v in n.items() if k != "_path"} for nid, n in sorted(nodes.items())},
        "incoming": {t: {k: sorted({s for s, _ in v}) for k, v in kinds.items()}
                     for t, kinds in sorted(resolved.items())},
    }
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / f"kb-{meta['version']}.json"
    out.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "INDEX.md").write_text(build_index(nodes, meta, resolved), encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT).as_posix()} and INDEX.md ({len(nodes)} nodes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

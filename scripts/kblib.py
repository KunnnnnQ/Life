"""Shared loading and checking logic for the knowledge base."""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass, field

import yaml
from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parent.parent
NODES_DIR = ROOT / "nodes"
SCHEMA_PATH = ROOT / "schema" / "node.schema.json"

FOLDER = {
    "construct": "constructs",
    "instrument": "instruments",
    "strategy": "strategies",
    "mechanic": "mechanics",
    "goal": "goals",
    "source": "sources",
    "risk": "risks",
}

# relation type -> allowed (from_type, to_type) pairs
RELATION_RULES = {
    "measures": {("instrument", "construct")},
    "part_of": {("construct", "construct"), ("strategy", "strategy"), ("strategy", "construct")},
    "targets": {("strategy", "construct"), ("goal", "construct")},
    "implements": {("mechanic", "strategy")},
    "serves": {("mechanic", "goal")},
    "derived_from": {("instrument", "instrument")},
    "contrasts_with": None,  # any pair of the same type
    "related_to": None,      # any pair
    "threatens": {("risk", t) for t in ("construct", "instrument", "strategy", "mechanic", "goal")},
}

OPEN_LICENSES = {"public-domain", "open"}


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f"{where}: {msg}")


def load_nodes(report: Report) -> dict[str, dict]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    nodes: dict[str, dict] = {}
    for path in sorted(NODES_DIR.rglob("*")):
        if path.is_dir():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if path.suffix != ".yaml":
            report.err(rel, "only .yaml files are allowed under nodes/")
            continue
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as e:
            report.err(rel, f"YAML parse error: {e}")
            continue
        if not isinstance(data, dict):
            report.err(rel, "file must contain a single mapping")
            continue
        for e in validator.iter_errors(data):
            loc = "/".join(str(p) for p in e.absolute_path) or "(root)"
            report.err(rel, f"schema: {loc}: {e.message}")
        nid, ntype = data.get("id"), data.get("type")
        if not nid or not ntype:
            continue
        if not nid.startswith(f"{ntype}."):
            report.err(rel, f"id '{nid}' does not start with type '{ntype}.'")
        expected = f"nodes/{FOLDER.get(ntype, '?')}/{nid.split('.', 1)[-1]}.yaml"
        if rel != expected:
            report.err(rel, f"file should be at {expected}")
        if nid in nodes:
            report.err(rel, f"duplicate id '{nid}'")
        data["_path"] = rel
        nodes[nid] = data
    return nodes


def iter_evidence(node: dict):
    for rel in node.get("relations", []):
        for ev in rel.get("evidence", []):
            yield ev, f"relation {rel['type']} -> {rel['target']}"
    for i, claim in enumerate(node.get("claims", [])):
        for ev in claim.get("evidence", []):
            yield ev, f"claim #{i + 1}"


def check_graph(nodes: dict[str, dict], report: Report) -> None:
    cited: set[str] = set()
    dois: dict[str, str] = {}

    for nid, node in nodes.items():
        where = node["_path"]
        ntype = node["type"]

        # relations
        seen = set()
        for rel in node.get("relations", []):
            key = (rel["type"], rel["target"])
            if key in seen:
                report.err(where, f"duplicate relation {key}")
            seen.add(key)
            target = nodes.get(rel["target"])
            if target is None:
                report.err(where, f"relation target '{rel['target']}' does not exist")
                continue
            rule = RELATION_RULES[rel["type"]]
            pair = (ntype, target["type"])
            if rel["type"] == "contrasts_with" and pair[0] != pair[1]:
                report.err(where, f"contrasts_with must link nodes of the same type, got {pair}")
            elif rule is not None and pair not in rule:
                allowed = ", ".join(f"{a}->{b}" for a, b in sorted(rule))
                report.err(where, f"'{rel['type']}' not allowed for {pair[0]}->{pair[1]} (allowed: {allowed})")
            if target.get("status") == "deprecated":
                report.warn(where, f"links to deprecated node '{rel['target']}'")

        # evidence
        for ev, ctx in iter_evidence(node):
            src = nodes.get(ev["source"])
            cited.add(ev["source"])
            if src is None:
                report.err(where, f"{ctx}: evidence source '{ev['source']}' does not exist")
            elif src["type"] != "source":
                report.err(where, f"{ctx}: '{ev['source']}' is not a source node")
            if ntype == "mechanic" and ev["level"] != "hypothesis":
                report.warn(where, f"{ctx}: mechanic evidence at level '{ev['level']}' - only use this if the study tested this mechanic itself")

        # type-specific rules
        if ntype == "mechanic":
            kinds = {r["type"] for r in node.get("relations", [])}
            for needed in ("implements", "serves"):
                if needed not in kinds:
                    report.err(where, f"mechanic needs at least one '{needed}' relation")
            for rel in node.get("relations", []):
                if not rel.get("evidence"):
                    report.warn(where, f"evidence gap: {rel['type']} -> {rel['target']} has no evidence")

        if ntype == "instrument":
            inst = node.get("instrument", {})
            lic = inst.get("license", {}).get("status")
            if inst.get("items_in_repo") and lic not in OPEN_LICENSES:
                report.err(where, f"items_in_repo is true but license status is '{lic}'")
            if not any(r["type"] == "measures" for r in node.get("relations", [])):
                report.err(where, "instrument must 'measure' at least one construct")
            for lang in inst.get("languages", []):
                if lang.get("source"):
                    cited.add(lang["source"])
                    if lang["source"] not in nodes:
                        report.err(where, f"language source '{lang['source']}' does not exist")
            for sub in inst.get("subscales", []):
                if sub.get("measures") and sub["measures"] not in nodes:
                    report.err(where, f"subscale measures unknown node '{sub['measures']}'")
            declared = sum(s.get("items", 0) for s in inst.get("subscales", []))
            if inst.get("subscales") and all("items" in s for s in inst["subscales"]) and declared != inst.get("items"):
                report.err(where, f"subscale items sum to {declared}, but items = {inst.get('items')}")

        if ntype == "risk":
            has_evidence = any(True for _ in iter_evidence(node))
            if not has_evidence:
                report.err(where, "risk must cite at least one source (in claims or relation evidence)")
            if not any(r["type"] == "threatens" for r in node.get("relations", [])) and not node.get("risk", {}).get("components"):
                report.warn(where, "risk neither threatens a node nor names a product component")

        if ntype == "goal":
            for key in ("default_measure", "research_measure"):
                measure = node.get("product_use", {}).get(key)
                if measure and measure not in nodes:
                    report.err(where, f"{key} '{measure}' does not exist")

        if node.get("status") == "deprecated" and node.get("replaced_by") not in nodes:
            report.err(where, f"replaced_by '{node.get('replaced_by')}' does not exist")

        if ntype == "source":
            doi = node["citation"].get("doi")
            if doi:
                key = doi.lower()
                if key in dois:
                    report.err(where, f"DOI {doi} already used by {dois[key]}")
                dois[key] = nid
            elif not node["citation"].get("url"):
                report.err(where, "source needs a doi or a url")

    for nid, node in nodes.items():
        if node["type"] == "source" and nid not in cited:
            report.warn(node["_path"], "source is not cited by any node")


def load_meta() -> dict:
    return yaml.safe_load((ROOT / "kb.yaml").read_text(encoding="utf-8"))

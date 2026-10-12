"""Validated adapter around PyNiteFEA for Caddr's first structural-analysis slice.

Input values must use one consistent unit system. No automatic unit conversion
or building-code design is performed here.
"""
from __future__ import annotations

import importlib.metadata
import math
import re
from typing import Any

from Pynite import FEModel3D


class ModelInputError(ValueError):
    """Raised when a submitted model is incomplete or outside the MVP contract."""


class SolverRunError(RuntimeError):
    """Raised when the finite-element engine cannot solve a validated model."""


DOF = ("DX", "DY", "DZ", "RX", "RY", "RZ")
NODE_DIRECTIONS = {"FX", "FY", "FZ", "MX", "MY", "MZ"}
MEMBER_DIRECTIONS = {
    "Fx", "Fy", "Fz", "Mx", "My", "Mz",
    "FX", "FY", "FZ", "MX", "MY", "MZ",
}
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_. -]{0,63}$")
MAX_BODY_NODES = 100
MAX_BODY_MEMBERS = 160
MAX_LOADS = 500
MAX_COMBINATIONS = 20


def engine_health() -> dict[str, Any]:
    try:
        version = importlib.metadata.version("PyniteFEA")
    except importlib.metadata.PackageNotFoundError:
        version = "unknown"
    return {
        "status": "ok",
        "engine": "PyNiteFEA",
        "version": version,
        "analysisMethod": "linear elastic 3D finite-element analysis",
        "features": [
            "beam and frame members",
            "nodal and member loads",
            "load combinations",
            "support reactions and nodal displacements",
            "member shear, moment, axial force and deflection summaries",
        ],
        "limitations": [
            "No automatic building-code design or reinforcement design",
            "No automatic unit conversion",
            "Submitted models must use one consistent unit system",
        ],
    }


def _mapping(value: Any, label: str) -> dict:
    if not isinstance(value, dict):
        raise ModelInputError(label + " must be an object.")
    return value


def _list(value: Any, label: str, minimum: int = 0, maximum: int | None = None) -> list:
    if not isinstance(value, list):
        raise ModelInputError(label + " must be a list.")
    if len(value) < minimum:
        raise ModelInputError(label + " must contain at least " + str(minimum) + " item(s).")
    if maximum is not None and len(value) > maximum:
        raise ModelInputError(label + " exceeds the current prototype limit of " + str(maximum) + ".")
    return value


def _name(value: Any, label: str) -> str:
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value.strip()):
        raise ModelInputError(label + " must be a 1–64 character identifier using letters, numbers, spaces, dots, underscores or hyphens.")
    return value.strip()


def _number(value: Any, label: str, *, positive: bool = False, nonnegative: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ModelInputError(label + " must be a number.")
    result = float(value)
    if not math.isfinite(result) or abs(result) > 1e15:
        raise ModelInputError(label + " must be a finite, reasonable number.")
    if positive and result <= 0:
        raise ModelInputError(label + " must be greater than zero.")
    if nonnegative and result < 0:
        raise ModelInputError(label + " cannot be negative.")
    return result


def _unique_named_items(items: list, label: str) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for index, item in enumerate(items):
        item = _mapping(item, label + "[" + str(index) + "]")
        item_id = _name(item.get("id"), label + "[" + str(index) + "].id")
        if item_id in result:
            raise ModelInputError(label + " contains duplicate id '" + item_id + "'.")
        result[item_id] = item
    return result


def _supports(value: Any, node_id: str) -> dict[str, bool]:
    raw = value if value is not None else {}
    raw = _mapping(raw, "Node " + node_id + " supports")
    unknown = set(raw) - set(DOF)
    if unknown:
        raise ModelInputError("Node " + node_id + " has unknown support DOF: " + ", ".join(sorted(unknown)) + ".")
    result: dict[str, bool] = {}
    for dof in DOF:
        flag = raw.get(dof, False)
        if not isinstance(flag, bool):
            raise ModelInputError("Node " + node_id + " support " + dof + " must be true or false.")
        result[dof] = flag
    return result


def _metric(obj: Any, method_name: str, *args: Any) -> float | None:
    try:
        value = getattr(obj, method_name)(*args)
        if isinstance(value, tuple):
            value = value[0]
        value = float(value)
        return value if math.isfinite(value) else None
    except Exception:
        return None


def _result_value(obj: Any, property_name: str, combo_name: str) -> float | None:
    try:
        values = getattr(obj, property_name)
        value = values.get(combo_name)
        if value is None:
            return None
        number = float(value)
        return number if math.isfinite(number) else None
    except (AttributeError, KeyError, TypeError, ValueError):
        return None


def _build_and_validate(raw_model: Any) -> tuple[FEModel3D, dict, set[str], list[str]]:
    data = _mapping(raw_model, "model")
    units = data.get("units", "unspecified")
    if not isinstance(units, str) or not units.strip() or len(units) > 40:
        raise ModelInputError("model.units must be a short unit-system label such as 'kN-m'.")

    nodes = _unique_named_items(_list(data.get("nodes"), "model.nodes", 2, MAX_BODY_NODES), "model.nodes")
    materials = _unique_named_items(_list(data.get("materials"), "model.materials", 1, 20), "model.materials")
    sections = _unique_named_items(_list(data.get("sections"), "model.sections", 1, 40), "model.sections")
    members = _unique_named_items(_list(data.get("members"), "model.members", 1, MAX_BODY_MEMBERS), "model.members")
    loads = _list(data.get("loads", []), "model.loads", 1, MAX_LOADS)
    raw_combos = _list(data.get("combinations"), "model.combinations", 1, MAX_COMBINATIONS)

    positions: dict[str, tuple[float, float, float]] = {}
    support_map: dict[str, dict[str, bool]] = {}
    for node_id, node in nodes.items():
        positions[node_id] = (
            _number(node.get("x"), "Node " + node_id + ".x"),
            _number(node.get("y"), "Node " + node_id + ".y"),
            _number(node.get("z"), "Node " + node_id + ".z"),
        )
        support_map[node_id] = _supports(node.get("supports"), node_id)

    validated_materials: dict[str, tuple[float, float, float, float]] = {}
    for material_id, material in materials.items():
        E = _number(material.get("E"), "Material " + material_id + ".E", positive=True)
        G = _number(material.get("G"), "Material " + material_id + ".G", positive=True)
        nu = _number(material.get("nu"), "Material " + material_id + ".nu")
        rho = _number(material.get("rho", 0), "Material " + material_id + ".rho", nonnegative=True)
        if nu < 0 or nu >= 0.5:
            raise ModelInputError("Material " + material_id + ".nu must be in the range 0 ≤ nu < 0.5.")
        validated_materials[material_id] = (E, G, nu, rho)

    validated_sections: dict[str, tuple[float, float, float, float]] = {}
    for section_id, section in sections.items():
        validated_sections[section_id] = (
            _number(section.get("A"), "Section " + section_id + ".A", positive=True),
            _number(section.get("Iy"), "Section " + section_id + ".Iy", positive=True),
            _number(section.get("Iz"), "Section " + section_id + ".Iz", positive=True),
            _number(section.get("J"), "Section " + section_id + ".J", positive=True),
        )

    member_lengths: dict[str, float] = {}
    for member_id, member in members.items():
        ni = _name(member.get("iNode"), "Member " + member_id + ".iNode")
        nj = _name(member.get("jNode"), "Member " + member_id + ".jNode")
        material_id = _name(member.get("materialId"), "Member " + member_id + ".materialId")
        section_id = _name(member.get("sectionId"), "Member " + member_id + ".sectionId")
        if ni not in nodes or nj not in nodes:
            raise ModelInputError("Member " + member_id + " references a node that does not exist.")
        if ni == nj:
            raise ModelInputError("Member " + member_id + " must connect two different nodes.")
        if material_id not in materials or section_id not in sections:
            raise ModelInputError("Member " + member_id + " references an unknown material or section.")
        length = math.sqrt(sum((positions[ni][i] - positions[nj][i]) ** 2 for i in range(3)))
        if not math.isfinite(length) or length <= 1e-9:
            raise ModelInputError("Member " + member_id + " has zero or invalid length.")
        member["iNode"] = ni
        member["jNode"] = nj
        member["materialId"] = material_id
        member["sectionId"] = section_id
        member["rotation"] = _number(member.get("rotation", 0), "Member " + member_id + ".rotation")
        member_lengths[member_id] = length

    load_cases: set[str] = set()
    validated_loads: list[dict] = []
    for index, load in enumerate(loads):
        load = _mapping(load, "model.loads[" + str(index) + "]")
        kind = load.get("type")
        case = _name(load.get("case"), "Load case at model.loads[" + str(index) + "]")
        direction = load.get("direction")
        if kind == "nodal":
            node_id = _name(load.get("nodeId"), "Nodal load nodeId")
            if node_id not in nodes:
                raise ModelInputError("Nodal load references unknown node '" + node_id + "'.")
            if direction not in NODE_DIRECTIONS:
                raise ModelInputError("Nodal load direction must be a global direction: " + ", ".join(sorted(NODE_DIRECTIONS)) + ".")
            value = _number(load.get("value"), "Nodal load value")
            validated_loads.append({"type": kind, "nodeId": node_id, "direction": direction, "value": value, "case": case})
        elif kind == "distributed":
            member_id = _name(load.get("memberId"), "Distributed load memberId")
            if member_id not in members:
                raise ModelInputError("Distributed load references unknown member '" + member_id + "'.")
            if direction not in MEMBER_DIRECTIONS:
                raise ModelInputError("Distributed load direction is invalid.")
            w1 = _number(load.get("w1"), "Distributed load w1")
            w2 = _number(load.get("w2"), "Distributed load w2")
            x1 = _number(load.get("x1", 0), "Distributed load x1", nonnegative=True)
            x2 = _number(load.get("x2", member_lengths[member_id]), "Distributed load x2", nonnegative=True)
            if x1 > x2 or x2 > member_lengths[member_id] + 1e-8:
                raise ModelInputError("Distributed load positions for " + member_id + " must satisfy 0 ≤ x1 ≤ x2 ≤ member length.")
            validated_loads.append({"type": kind, "memberId": member_id, "direction": direction, "w1": w1, "w2": w2, "x1": x1, "x2": x2, "case": case})
        elif kind == "point":
            member_id = _name(load.get("memberId"), "Point load memberId")
            if member_id not in members:
                raise ModelInputError("Point load references unknown member '" + member_id + "'.")
            if direction not in MEMBER_DIRECTIONS:
                raise ModelInputError("Point load direction is invalid.")
            value = _number(load.get("value"), "Point load value")
            x = _number(load.get("x"), "Point load x", nonnegative=True)
            if x > member_lengths[member_id] + 1e-8:
                raise ModelInputError("Point load position must be within member '" + member_id + "'.")
            validated_loads.append({"type": kind, "memberId": member_id, "direction": direction, "value": value, "x": x, "case": case})
        else:
            raise ModelInputError("Load type must be 'nodal', 'distributed' or 'point'.")
        load_cases.add(case)

    if not load_cases:
        raise ModelInputError("At least one load case is required.")
    combos: list[dict] = []
    combo_names: set[str] = set()
    for index, combo in enumerate(raw_combos):
        combo = _mapping(combo, "model.combinations[" + str(index) + "]")
        combo_name = _name(combo.get("name"), "Load combination name")
        if combo_name in combo_names:
            raise ModelInputError("Duplicate load combination '" + combo_name + "'.")
        factors = _mapping(combo.get("factors"), "Load combination " + combo_name + ".factors")
        if not factors:
            raise ModelInputError("Load combination " + combo_name + " must contain load factors.")
        cleaned_factors: dict[str, float] = {}
        for case_name, factor in factors.items():
            case_name = _name(case_name, "Load case in combination " + combo_name)
            if case_name not in load_cases:
                raise ModelInputError("Combination " + combo_name + " references load case '" + case_name + "' that has no load.")
            cleaned_factors[case_name] = _number(factor, "Combination factor " + case_name)
        if not any(value != 0 for value in cleaned_factors.values()):
            raise ModelInputError("Load combination " + combo_name + " cannot have all-zero factors.")
        combos.append({"name": combo_name, "factors": cleaned_factors})
        combo_names.add(combo_name)

    model = FEModel3D()
    try:
        for material_id, properties in validated_materials.items():
            model.add_material(material_id, *properties)
        for section_id, properties in validated_sections.items():
            model.add_section(section_id, *properties)
        for node_id, (x, y, z) in positions.items():
            model.add_node(node_id, x, y, z)
            s = support_map[node_id]
            model.def_support(node_id, *(s[dof] for dof in DOF))
        for member_id, member in members.items():
            rotation = _number(member.get("rotation", 0), "Member " + member_id + ".rotation")
            model.add_member(member_id, member["iNode"], member["jNode"], member["materialId"], member["sectionId"], rotation=rotation)
        for load in validated_loads:
            if load["type"] == "nodal":
                model.add_node_load(load["nodeId"], load["direction"], load["value"], case=load["case"])
            elif load["type"] == "distributed":
                model.add_member_dist_load(
                    load["memberId"], load["direction"], load["w1"], load["w2"],
                    x1=load["x1"], x2=load["x2"], case=load["case"],
                )
            else:
                model.add_member_pt_load(
                    load["memberId"], load["direction"], load["value"], load["x"], case=load["case"],
                )
        for combo in combos:
            model.add_load_combo(combo["name"], combo["factors"])
    except ModelInputError:
        raise
    except Exception as exc:
        raise ModelInputError("The model could not be assembled. Check the geometry, support definitions, materials, sections and load directions.") from exc

    return model, data, load_cases, [combo["name"] for combo in combos]


def analyze_model(raw_model: Any) -> dict[str, Any]:
    model, data, load_cases, combo_names = _build_and_validate(raw_model)
    try:
        model.analyze_linear(check_stability=True, check_statics=True)
    except Exception as exc:
        raise SolverRunError(
            "The model could not be solved. Check for unstable supports, disconnected members, "
            "invalid releases or inconsistent model units."
        ) from exc

    node_results: dict[str, dict] = {}
    member_results: dict[str, dict] = {}
    combinations = []
    reaction_names = {
        "FX": "RxnFX", "FY": "RxnFY", "FZ": "RxnFZ",
        "MX": "RxnMX", "MY": "RxnMY", "MZ": "RxnMZ",
    }
    for combo_name in combo_names:
        combo_nodes = []
        for node_id, node in model.nodes.items():
            displacements = {
                dof: _result_value(node, dof, combo_name)
                for dof in DOF
            }
            reactions = {
                direction: _result_value(node, property_name, combo_name)
                for direction, property_name in reaction_names.items()
            }
            combo_nodes.append({"nodeId": node_id, "displacements": displacements, "reactions": reactions})

        combo_members = []
        for member_id, member in model.members.items():
            length = _metric(member, "L")
            combo_members.append({
                "memberId": member_id,
                "length": length,
                "maxAxial": _metric(member, "max_axial", combo_name),
                "minAxial": _metric(member, "min_axial", combo_name),
                "maxShearY": _metric(member, "max_shear", "Fy", combo_name),
                "minShearY": _metric(member, "min_shear", "Fy", combo_name),
                "maxShearZ": _metric(member, "max_shear", "Fz", combo_name),
                "minShearZ": _metric(member, "min_shear", "Fz", combo_name),
                "maxMomentY": _metric(member, "max_moment", "My", combo_name),
                "minMomentY": _metric(member, "min_moment", "My", combo_name),
                "maxMomentZ": _metric(member, "max_moment", "Mz", combo_name),
                "minMomentZ": _metric(member, "min_moment", "Mz", combo_name),
                "maxDeflectionY": _metric(member, "max_deflection", "dy", combo_name),
                "minDeflectionY": _metric(member, "min_deflection", "dy", combo_name),
                "maxDeflectionZ": _metric(member, "max_deflection", "dz", combo_name),
                "minDeflectionZ": _metric(member, "min_deflection", "dz", combo_name),
            })
        combinations.append({
            "name": combo_name,
            "nodes": combo_nodes,
            "members": combo_members,
        })

    units = data.get("units", "unspecified")
    return {
        "ok": True,
        "engine": "PyNiteFEA",
        "version": engine_health()["version"],
        "analysisMethod": "linear-elastic",
        "modelName": data.get("name", "Untitled model"),
        "units": units,
        "loadCases": sorted(load_cases),
        "combinations": combinations,
        "warnings": [
            "Results use the submitted model and its consistent units; Caddr does not convert units automatically.",
            "This analysis does not perform building-code compliance, reinforced-concrete member design or reinforcement detailing.",
            "Verify modelling assumptions, stability and results independently before using them for engineering decisions.",
        ],
    }

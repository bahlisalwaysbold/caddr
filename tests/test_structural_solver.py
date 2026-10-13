import unittest

from backend.structural_solver import ModelInputError, analyze_model


def sample_beam_model():
    return {
        "name": "Caddr validation beam",
        "units": "kN-m",
        "nodes": [
            {"id": "N1", "x": 0, "y": 0, "z": 0, "supports": {"DX": True, "DY": True, "DZ": True}},
            {"id": "N2", "x": 6, "y": 0, "z": 0, "supports": {"DX": True, "DY": True, "DZ": True, "RX": True}},
        ],
        "materials": [
            {"id": "SteelDemo", "E": 200000000, "G": 76923077, "nu": 0.3, "rho": 78.5},
        ],
        "sections": [
            {"id": "DemoSection", "A": 0.01, "Iy": 0.000006, "Iz": 0.00008, "J": 0.0000008},
        ],
        "members": [
            {"id": "B1", "iNode": "N1", "jNode": "N2", "materialId": "SteelDemo", "sectionId": "DemoSection"},
        ],
        "loads": [
            {"type": "distributed", "memberId": "B1", "direction": "Fy", "w1": -10, "w2": -10, "x1": 0, "x2": 6, "case": "LIVE"},
        ],
        "combinations": [
            {"name": "DEMO_SERVICE", "factors": {"LIVE": 1}},
        ],
    }



def editable_portal_frame_model():
    nodes = []
    grid_names = ["A", "B", "C"]
    xs = [0, 4, 8]
    levels = [("L0", 0), ("L1", 3.3), ("L2", 6.6)]
    for level_id, y in levels:
        for name, x in zip(grid_names, xs):
            supports = {dof: True for dof in ("DX", "DY", "DZ", "RX", "RY", "RZ")} if level_id == "L0" else {}
            nodes.append({"id": "N_" + name + "_" + level_id, "x": x, "y": y, "z": 0, "supports": supports})

    members = []
    sections = []
    loads = []
    for span in range(2):
        for level in (1, 2):
            member_id = "BEAM_B" + str(span + 1) + "_L" + str(level)
            section_id = "SEC_" + member_id
            members.append({
                "id": member_id, "label": "Beam " + member_id, "kind": "beam",
                "iNode": "N_" + grid_names[span] + "_L" + str(level),
                "jNode": "N_" + grid_names[span + 1] + "_L" + str(level),
                "materialId": "Concrete_E25GPa", "sectionId": section_id,
            })
            b, h = 0.25, 0.45
            sections.append({"id": section_id, "A": b*h, "Iy": h*b**3/12, "Iz": b*h**3/12, "J": 0.0008})
            loads.append({"type": "distributed", "memberId": member_id, "direction": "FY", "w1": -12, "w2": -12, "x1": 0, "x2": 4, "case": "G"})
    for grid, name in enumerate(grid_names):
        for floor in range(2):
            member_id = "COL_" + name + "_L" + str(floor) + "_L" + str(floor + 1)
            section_id = "SEC_" + member_id
            members.append({
                "id": member_id, "label": "Column " + name, "kind": "column",
                "iNode": "N_" + name + "_L" + str(floor),
                "jNode": "N_" + name + "_L" + str(floor + 1),
                "materialId": "Concrete_E25GPa", "sectionId": section_id,
            })
            b = h = 0.3
            sections.append({"id": section_id, "A": b*h, "Iy": b*h**3/12, "Iz": b*h**3/12, "J": 0.0008})

    return {
        "name": "Editable portal-frame regression",
        "units": "kN-m",
        "nodes": nodes,
        "materials": [{"id": "Concrete_E25GPa", "E": 25000000, "G": 10416666.6667, "nu": 0.2, "rho": 24}],
        "sections": sections,
        "members": members,
        "loads": loads,
        "combinations": [{"name": "G_SERVICE", "factors": {"G": 1.0}}],
    }

class StructuralSolverTests(unittest.TestCase):
    def test_simply_supported_uniformly_loaded_beam(self):
        result = analyze_model(sample_beam_model())
        self.assertTrue(result["ok"])
        self.assertEqual(result["engine"], "PyNiteFEA")
        combo = result["combinations"][0]
        self.assertEqual(combo["name"], "DEMO_SERVICE")
        self.assertEqual(len(combo["members"]), 1)
        self.assertEqual(len(combo["members"][0]["diagramSamples"]), 17)
        self.assertAlmostEqual(combo["nodes"][0]["reactions"]["FY"], 30, delta=0.1)
        self.assertAlmostEqual(combo["nodes"][1]["reactions"]["FY"], 30, delta=0.1)
        member = combo["members"][0]
        peak_moment = max(abs(member["maxMomentZ"] or 0), abs(member["minMomentZ"] or 0))
        self.assertAlmostEqual(peak_moment, 45, delta=0.5)
        peak_deflection = max(abs(member["maxDeflectionY"] or 0), abs(member["minDeflectionY"] or 0))
        self.assertGreater(peak_deflection, 0.005)
        self.assertLess(peak_deflection, 0.02)

    def test_editable_portal_frame_returns_results_for_all_members(self):
        result = analyze_model(editable_portal_frame_model())
        combo = result["combinations"][0]
        self.assertEqual(combo["name"], "G_SERVICE")
        self.assertEqual(len(combo["nodes"]), 9)
        self.assertEqual(len(combo["members"]), 10)
        support_reactions = sum(
            node["reactions"]["FY"] or 0
            for node in combo["nodes"]
            if node["nodeId"].endswith("_L0")
        )
        self.assertAlmostEqual(support_reactions, 192, delta=0.5)
        for member in combo["members"]:
            self.assertEqual(len(member["diagramSamples"]), 17)
            self.assertIn(member["kind"], ("beam", "column"))
            self.assertIsNotNone(member["length"])

    def test_rejects_unknown_node_reference(self):
        model = sample_beam_model()
        model["members"][0]["jNode"] = "missing-node"
        with self.assertRaises(ModelInputError):
            analyze_model(model)

    def test_rejects_inconsistent_load_position(self):
        model = sample_beam_model()
        model["loads"][0]["x2"] = 7
        with self.assertRaises(ModelInputError):
            analyze_model(model)

    def test_rejects_empty_combination(self):
        model = sample_beam_model()
        model["combinations"][0]["factors"] = {}
        with self.assertRaises(ModelInputError):
            analyze_model(model)


if __name__ == "__main__":
    unittest.main()

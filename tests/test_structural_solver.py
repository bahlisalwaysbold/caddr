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


class StructuralSolverTests(unittest.TestCase):
    def test_simply_supported_uniformly_loaded_beam(self):
        result = analyze_model(sample_beam_model())
        self.assertTrue(result["ok"])
        self.assertEqual(result["engine"], "PyNiteFEA")
        combo = result["combinations"][0]
        self.assertEqual(combo["name"], "DEMO_SERVICE")
        self.assertEqual(len(combo["members"]), 1)
        self.assertAlmostEqual(combo["nodes"][0]["reactions"]["FY"], 30, delta=0.1)
        self.assertAlmostEqual(combo["nodes"][1]["reactions"]["FY"], 30, delta=0.1)
        member = combo["members"][0]
        peak_moment = max(abs(member["maxMomentZ"] or 0), abs(member["minMomentZ"] or 0))
        self.assertAlmostEqual(peak_moment, 45, delta=0.5)
        peak_deflection = max(abs(member["maxDeflectionY"] or 0), abs(member["minDeflectionY"] or 0))
        self.assertGreater(peak_deflection, 0.005)
        self.assertLess(peak_deflection, 0.02)

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

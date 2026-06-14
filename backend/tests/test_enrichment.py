import unittest
from backend.scraper.enrichment import (
    parse_gpu_type,
    parse_gpu_name,
    parse_processor_generation,
    parse_processor_series,
    parse_ddr_gen,
    parse_storage_type,
    parse_processor_range,
)

class TestEnrichmentParsers(unittest.TestCase):
    def test_parse_gpu_type(self):
        self.assertEqual(parse_gpu_type("Integrated AMD Radeon™ Graphics"), "Integrated")
        self.assertEqual(parse_gpu_type("NVIDIA® GeForce RTX™ 3050 A Laptop GPU 4GB GDDR6"), "Dedicated")
        self.assertEqual(parse_gpu_type("Integrated Intel® Arc™ 140V GPU"), "Integrated")
        self.assertEqual(parse_gpu_type("NVIDIA® Geforce RTX™ 5060 Laptop GPU 8GB GDDR7"), "Dedicated")
        self.assertEqual(parse_gpu_type("Intel® Arc™ Graphics"), "Integrated")
        self.assertEqual(parse_gpu_type(None), None)

    def test_parse_gpu_name(self):
        self.assertEqual(parse_gpu_name("Integrated AMD Radeon™ Graphics"), "AMD Radeon Graphics")
        self.assertEqual(parse_gpu_name("NVIDIA® GeForce RTX™ 3050 A Laptop GPU 4GB GDDR6"), "NVIDIA GeForce RTX 3050 A")
        self.assertEqual(parse_gpu_name("NVIDIA® Geforce RTX™ 5070 Ti Laptop GPU 12GB GDDR7"), "NVIDIA GeForce RTX 5070 Ti")
        self.assertEqual(parse_gpu_name("Integrated Intel® Arc™ 140V GPU"), "Intel Arc 140V")
        self.assertEqual(parse_gpu_name("Integrated AMD Radeon™ 610M"), "AMD Radeon 610M")
        self.assertEqual(parse_gpu_name("Integrated AMD Radeon™ 680M"), "AMD Radeon 680M")
        self.assertEqual(parse_gpu_name("Integrated AMD Radeon™ 860M"), "AMD Radeon 860M")
        self.assertEqual(parse_gpu_name("Intel® Arc™ Graphics"), "Intel Arc Graphics")
        self.assertEqual(parse_gpu_name("Integrated Intel® UHD Graphics"), "Intel UHD Graphics")
        self.assertEqual(parse_gpu_name(None), None)

    def test_parse_processor_generation(self):
        self.assertEqual(parse_processor_generation("12th Generation Intel® Core™ i3-1215U"), "12th Gen")
        self.assertEqual(parse_processor_generation("Intel® Core™ Ultra 7 165U vPro® Processor"), "Core Ultra Series 1")
        self.assertEqual(parse_processor_generation("Intel® Core™ Ultra 7 256V Processor"), "Core Ultra Series 2")
        self.assertEqual(parse_processor_generation("Intel® Core™ Ultra 5 125H Processor"), "Core Ultra Series 1")
        self.assertEqual(parse_processor_generation("AMD Ryzen™ 5 7520U Processor"), "Ryzen 7000 Series")
        self.assertEqual(parse_processor_generation("AMD Ryzen™ 7 8840HS Processor"), "Ryzen 8000 Series")
        self.assertEqual(parse_processor_generation("AMD Ryzen™ AI 7 350 Processor"), "Ryzen AI 300 Series")
        self.assertEqual(parse_processor_generation("AMD Ryzen™ 5 5625U Processor"), "Ryzen 5000 Series")
        self.assertEqual(parse_processor_generation("Intel® Core™ 5 210H Processor"), "Core Series 2")
        self.assertEqual(parse_processor_generation(None), None)

    def test_parse_processor_series(self):
        self.assertEqual(parse_processor_series("Intel® Core™ Ultra 7 256V Processor"), "V-Series")
        self.assertEqual(parse_processor_series("13th Generation Intel® Core™ i7-13650HX Processor"), "HX-Series")
        self.assertEqual(parse_processor_series("AMD Ryzen™ 5 7535HS Processor"), "H/HS-Series")
        self.assertEqual(parse_processor_series("AMD Ryzen™ 5 7520U Processor"), "U-Series")
        self.assertEqual(parse_processor_series("Intel® Core™ Ultra 5 125H Processor"), "H/HS-Series")
        self.assertEqual(parse_processor_series("Intel® Core™ Ultra 5 125U Processor"), "U-Series")
        self.assertEqual(parse_processor_series("Other CPU String"), "Other")
        self.assertEqual(parse_processor_series(None), None)

    def test_parse_ddr_gen(self):
        self.assertEqual(parse_ddr_gen("16 GB LPDDR5X-8533MT/s (Memory on Package)"), "LPDDR5X")
        self.assertEqual(parse_ddr_gen("16 GB LPDDR5-4800MT/s (Soldered)"), "LPDDR5")
        self.assertEqual(parse_ddr_gen("8 GB DDR5-4800MT/s (SODIMM)"), "DDR5")
        self.assertEqual(parse_ddr_gen("8 GB DDR4-3200MT/s (Soldered)"), "DDR4")
        self.assertEqual(parse_ddr_gen(None), None)

    def test_parse_storage_type(self):
        self.assertEqual(parse_storage_type("1 TB SSD M.2 2280 PCIe Gen4 TLC"), "SSD (NVMe)")
        self.assertEqual(parse_storage_type("512 GB SSD M.2 2242 PCIe QLC"), "SSD (NVMe)")
        self.assertEqual(parse_storage_type("256 GB SATA SSD"), "SSD (SATA)")
        self.assertEqual(parse_storage_type("1 TB HDD 5400rpm"), "HDD")
        self.assertEqual(parse_storage_type("64 GB eMMC"), "eMMC")
        self.assertEqual(parse_storage_type(None), None)

    def test_parse_processor_range(self):
        self.assertEqual(parse_processor_range("12th Generation Intel® Core™ i3-1215U"), "Intel Core i3")
        self.assertEqual(parse_processor_range("12th Generation Intel® Core™ i5-12450H"), "Intel Core i5")
        self.assertEqual(parse_processor_range("13th Generation Intel® Core™ i7-13620H"), "Intel Core i7")
        self.assertEqual(parse_processor_range("AMD Ryzen™ 3 7320U Processor"), "AMD Ryzen 3")
        self.assertEqual(parse_processor_range("AMD Ryzen™ 5 5625U Processor"), "AMD Ryzen 5")
        self.assertEqual(parse_processor_range("AMD Ryzen™ 7 5825U Processor"), "AMD Ryzen 7")
        self.assertEqual(parse_processor_range("AMD Ryzen™ AI 7 350 Processor"), "AMD Ryzen AI 7")
        self.assertEqual(parse_processor_range("AMD Ryzen™ AI 9 365 Processor"), "AMD Ryzen AI 9")
        self.assertEqual(parse_processor_range("Intel® Core™ 5 210H Processor"), "Intel Core 5")
        self.assertEqual(parse_processor_range("Intel® Core™ Ultra 5 125H Processor"), "Intel Core Ultra 5")
        self.assertEqual(parse_processor_range("Intel® Core™ Ultra 7 155H Processor"), "Intel Core Ultra 7")
        self.assertEqual(parse_processor_range("Intel® Core™ Ultra 9 185H Processor"), "Intel Core Ultra 9")
        self.assertEqual(parse_processor_range(None), None)

if __name__ == "__main__":
    unittest.main()

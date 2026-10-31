/**
 * 한 번의 호출로 체계별 차트 텍스트·화면용 view·자동 검사용 facts를 만든다.
 */
import { asOfDate, chartView, computeSaju, describeChart, normalizeBirth, sajuFacts } from "./chart.js";
import { computeNatal } from "./natal.js";
import { computeZiwei } from "./ziwei.js";
import { SEOUL, SYSTEMS, type ComputeRequest, type ComputeResponse } from "./types.js";

export async function compute(req: ComputeRequest): Promise<ComputeResponse> {
  const { asOf: asOfDay, systems = SYSTEMS, ...input } = req;
  const asOf = asOfDate(asOfDay);
  const norm = normalizeBirth(input);
  const place = norm.place ?? SEOUL;
  const birth = { date: norm.date, time: norm.time ?? null, gender: norm.gender, jasiMethod: norm.jasiMethod, place };
  const out: ComputeResponse = { birth, asOf };

  if (systems.includes("saju")) {
    const saju = computeSaju(birth);
    const chartText = describeChart(saju, asOf);
    out.saju = {
      chartText,
      view: chartView(saju, asOf),
      facts: sajuFacts(saju, asOf, chartText),
      pillars: saju.pillars.map((p) => (p.pillar.ganzi === "??" ? null : p.pillar.ganzi)),
    };
  }
  if (systems.includes("ziwei")) {
    if (birth.time) {
      const z = computeZiwei(birth, place, asOf);
      out.ziwei = { chartText: z.text, view: z.view, facts: z.facts };
    } else {
      out.ziwei = null;
    }
  }
  if (systems.includes("natal")) {
    const n = await computeNatal(birth, place, asOf);
    out.natal = { chartText: n.text, view: n.view, facts: n.facts };
  }
  return out;
}

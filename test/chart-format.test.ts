/**
 * 차트 텍스트가 docs/chart_format.md의 섹션을 하나도 빠뜨리지 않는지,
 * 라이브러리 README 케이스의 known 값(evals/cases.yaml)과 맞는지 확인한다.
 * 프롬프트가 섹션 이름을 그대로 참조하므로 이름이 바뀌면 여기서 먼저 깨져야 한다.
 */
import { describe, expect, it } from "vitest";
import { SEOUL } from "../src/types.js";
import { asOfDate, computeSaju, describeChart } from "../src/chart.js";
import { computeZiwei } from "../src/ziwei.js";
import { computeNatal } from "../src/natal.js";
import { createApp } from "../src/app.js";

const AS_OF = asOfDate("2026-10-29");
const README = { date: "1993-03-12", time: "09:45", gender: "M", jasiMethod: "unified", place: SEOUL } as const;
const sections = (text: string) => [...text.matchAll(/^\[([^\]]+)\]/gm)].map((m) => m[1]!);

const SAJU = ["기준", "기본", "원국", "일간", "신강약 재료", "간지 관계", "신살", "공망", "대운", "대운 관계", "세운", "세운 관계"];
const ZIWEI = ["기준", "기본", "12궁", "삼방사정", "생년 사화", "대한", "유년"];
const NATAL = ["기준", "기본", "행성", "앵글", "하우스 커스프", "애스펙트", "원소·모드", "트랜짓"];

describe("사주 차트 텍스트", () => {
  const text = describeChart(computeSaju(README), AS_OF);

  it("섹션이 형식 문서와 같은 순서로 모두 있다", () => {
    expect(sections(text).map((s) => s.replace(/ \(.*$/, ""))).toEqual(SAJU);
  });
  it("README 케이스: 사주 4주와 세운", () => {
    expect(text).toContain("시주 乙巳 |");
    expect(text).toContain("일주 壬辰 |");
    expect(text).toContain("월주 乙卯 |");
    expect(text).toContain("년주 癸酉 |");
    expect(text).toContain("2026년(올해) 丙午");
    expect(text).toContain("2027년(내년) 丁未");
  });
  it("README 케이스: 간지 관계 4건", () => {
    for (const r of ["巳酉 半合", "辰卯 害", "辰酉 合", "卯酉 沖"]) expect(text).toContain(r);
  });
  it("시간 미상이면 시주만 '시간 미상'이고 섹션은 빠지지 않는다", () => {
    const t = describeChart(computeSaju({ ...README, time: null }), AS_OF);
    expect(t).toContain("시주 시간 미상");
    expect(sections(t).map((s) => s.replace(/ \(.*$/, ""))).toEqual(SAJU);
    expect(t).toMatch(/\[기본\]\n성별 남 \/ 자시법 통자시 \/ 시간 미상/);
  });
});

describe("자미두수 차트 텍스트", () => {
  const z = computeZiwei(README, SEOUL, AS_OF);

  it("섹션이 모두 있다", () => expect(sections(z.text)).toEqual(ZIWEI));
  it("README 케이스: 명궁 戌 · 신궁 申 · 水二局", () => {
    expect(z.text).toContain("명궁 戌 / 신궁 申");
    expect(z.text).toContain("오행국 水二局");
    expect(z.text).toMatch(/命宮 壬戌 \| 天機\(得\) 天梁\(陷\)/);
  });
  it("삼방사정은 명궁·재백·관록·천이를 모두 다시 나열한다", () => {
    const block = z.text.split("[삼방사정]\n")[1]!.split("\n\n")[0]!;
    expect(block.split("\n")[0]).toBe("명궁 戌 / 財帛 午 / 官祿 寅 / 遷移 辰");
    expect(block.split("\n")).toHaveLength(5);
  });
  it("밝기와 생년사화는 한 괄호에 쉼표로 묶는다", () => expect(z.text).toMatch(/巨門\(廟,化權\)/));
});

describe("점성술 차트 텍스트", () => {
  it("섹션이 모두 있다", async () => {
    const n = await computeNatal(README, SEOUL, AS_OF);
    expect(sections(n.text)).toEqual(NATAL);
  });
  it("README 케이스: Sun Pisces / Moon Scorpio / ASC Taurus", async () => {
    const n = await computeNatal(README, SEOUL, AS_OF);
    expect(n.text).toMatch(/^Sun Pisces [\d.]+° 11하우스$/m);
    expect(n.text).toMatch(/^Moon Scorpio /m);
    expect(n.text).toMatch(/ASC Taurus [\d.]+°/);
    // 0.4.5에서는 0.0°. @orrery/core 0.5.0이 행성 위치를 0.1° 단위로 고쳤다 (같은 README 예시도 Sun 21.6° → 21.5°)
    expect(n.text).toMatch(/^Mars square Jupiter 0\.1°$/m);
  });
  it("시간 미상: 앵글·커스프는 '계산 불가', 하우스는 빠지고 달 표기가 붙는다", async () => {
    const n = await computeNatal({ ...README, time: null }, SEOUL, AS_OF);
    expect(sections(n.text)).toEqual(NATAL);
    expect(n.text).toContain("[앵글]\n시간 미상으로 계산 불가");
    expect(n.text).toContain("[하우스 커스프]\n시간 미상으로 계산 불가");
    const planetBlock = n.text.split("[행성]\n")[1]!.split("\n\n")[0]!;
    expect(planetBlock).not.toContain("하우스");
    expect(n.text).toMatch(/^Moon .*\(당일 이동 범위 큼\)$/m);
  });
});

describe("POST /compute", () => {
  const app = createApp();
  const post = (body: object) =>
    app.request("/compute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  type Out = { saju?: { chartText: string; view: unknown; facts: unknown }; ziwei?: { chartText: string; view: unknown } | null; natal?: { chartText: string; view: unknown } };

  it("체계마다 chartText·view·facts를 한 번에 돌려준다", async () => {
    const res = await post({ ...README, asOf: "2026-10-29" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Out;
    for (const out of [json.saju, json.ziwei, json.natal]) {
      expect(out!.chartText.startsWith("[기준]")).toBe(true);
      expect(out!.view).toBeTruthy();
    }
    expect(json.saju!.facts).toBeTruthy();
  });
  it("systems로 계산할 체계를 고른다", async () => {
    const json = (await (await post({ ...README, systems: ["natal"] })).json()) as Out;
    expect(Object.keys(json).sort()).toEqual(["asOf", "birth", "natal"]);
  });
  it("시간 미상이면 ziwei는 null", async () => {
    const json = (await (await post({ ...README, time: null })).json()) as Out;
    expect(json.ziwei).toBeNull();
    expect(json.saju).toBeTruthy();
  });
  it("잘못된 systems는 400", async () => expect((await post({ ...README, systems: ["tarot"] })).status).toBe(400));
  it("잘못된 asOf는 400", async () => expect((await post({ ...README, asOf: "내일" })).status).toBe(400));
});

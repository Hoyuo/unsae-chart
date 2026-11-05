/** 2026-11-04 코드 리뷰에서 고친 동작: 절입일 경고, 타임존 검증, 입력 오류 400, 날짜·기준일 검증, 시간 미상 달 애스펙트 제외 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { asOfDate, computeSaju, describeChart, sajuFacts } from "../src/chart.js";
import { computeNatal } from "../src/natal.js";
import { SEOUL } from "../src/types.js";

const AS_OF = asOfDate("2026-10-29");
const BASE = { date: "1990-05-12", time: "23:20", gender: "M", jasiMethod: "unified" } as const;
const app = createApp();
const post = (body: object) => app.request("/compute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const error = async (body: object) => ({ status: (await post(body)).status, ...((await (await post(body)).json()) as { error?: string }) });

describe("시간 미상 + 절입일", () => {
  it("2024-02-04(입춘 17:27)는 년주·월주가 갈린다고 적고 facts에도 남긴다", () => {
    const saju = computeSaju({ date: "2024-02-04", time: null, gender: "M", jasiMethod: "unified" });
    expect(saju.boundary).toEqual({ month: ["乙丑", "丙寅"], year: ["癸卯", "甲辰"] });
    const text = describeChart(saju, AS_OF);
    expect(text).toMatch(/\[기본\]\n성별 남 \/ 자시법 통자시 \/ 시간 미상\n절입일 출생\(시간 미상\): 년주 癸卯 또는 甲辰, 월주 乙丑 또는 丙寅/);
    expect(sajuFacts(saju, AS_OF, text).boundaryPillars).toEqual(saju.boundary);
  });
  it("시간을 알면 경고가 없고, 절입일이 아닌 시간 미상도 경고가 없다", () => {
    expect(computeSaju({ date: "2024-02-04", time: "20:00", gender: "M", jasiMethod: "unified" }).boundary).toBeUndefined();
    const plain = computeSaju({ ...BASE, time: null });
    expect(plain.boundary).toBeUndefined();
    expect(describeChart(plain, AS_OF)).not.toContain("절입일");
    expect(sajuFacts(plain, AS_OF, "")).not.toHaveProperty("boundaryPillars");
  });
});

describe("출생지 타임존", () => {
  it("해외 좌표에 timezone이 없으면 400 (서울 시간으로 조용히 계산하지 않는다)", async () => {
    const r = await error({ ...BASE, place: { name: "LA", lat: 34.05, lon: -118.24 }, systems: ["natal"] });
    expect(r.status).toBe(400);
    expect(r.error).toContain("타임존");
  });
  it("국내 좌표는 timezone을 생략해도 되고, 모르는 타임존은 400", async () => {
    expect((await post({ ...BASE, place: { name: "부산", lat: 35.18, lon: 129.08 }, systems: ["saju"] })).status).toBe(200);
    const r = await error({ ...BASE, place: { name: "화성", lat: 34.05, lon: -118.24, timezone: "Mars/Base" }, systems: ["saju"] });
    expect(r.status).toBe(400);
    expect(r.error).toContain("타임존");
  });
});

describe("입력 오류는 400", () => {
  it("서머타임 시작으로 건너뛴 시각", async () => {
    const r = await error({ date: "1988-05-08", time: "02:30", gender: "M", systems: ["saju"] });
    expect(r.status).toBe(400);
    expect(r.error).toContain("서머타임");
  });
  it("사주 없이 점성술·자미두수만 계산해도 없는 날짜와 범위 밖 연도는 400", async () => {
    for (const body of [{ date: "1993-02-30", time: "09:00", gender: "M", systems: ["natal"] }, { date: "1800-01-01", time: "09:00", gender: "M", systems: ["ziwei"] }, { date: "2999-01-01", time: "09:00", gender: "M", systems: ["natal"] }]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
  });
  it("asOf는 형식만이 아니라 실재하는 날짜여야 한다", async () => {
    expect((await post({ ...BASE, asOf: "2026-13-45", systems: ["saju"] })).status).toBe(400);
    expect((await post({ ...BASE, asOf: "9999-01-01", systems: ["saju"] })).status).toBe(400);
    expect((await post({ ...BASE, asOf: "2026-10-29", systems: ["saju"] })).status).toBe(200);
  });
});

describe("시간 미상 점성술", () => {
  it("달 애스펙트와 달 트랜짓은 본문과 facts에서 빠지고 사유를 적는다", async () => {
    const n = await computeNatal({ ...BASE, time: null }, SEOUL, AS_OF);
    const aspectBlock = n.text.split("[애스펙트]")[1]!.split("\n\n")[0]!;
    expect(aspectBlock).toContain("달 애스펙트는 시간 미상이라 제외");
    expect(aspectBlock).not.toMatch(/^Moon |Moon \d/m);
    expect(n.facts.aspects!.some((a) => a.p1 === "Moon" || a.p2 === "Moon")).toBe(false);
    // 시간을 알면 달 애스펙트가 있다
    const known = await computeNatal(BASE, SEOUL, AS_OF);
    expect(known.facts.aspects!.some((a) => a.p1 === "Moon" || a.p2 === "Moon")).toBe(true);
  });
  it("facts의 애스펙트는 본문에 적은 것(10행성)만 담는다", async () => {
    const n = await computeNatal(BASE, SEOUL, AS_OF);
    const natal = n.facts.aspects!.filter((a) => !["Jupiter", "Saturn"].includes(a.p1) || !["ASC", "MC", "Sun", "Moon", "Mercury", "Venus", "Mars"].includes(a.p2));
    expect(natal.some((a) => /Chiron|NorthNode|Node/.test(a.p1 + a.p2))).toBe(false);
  });
});

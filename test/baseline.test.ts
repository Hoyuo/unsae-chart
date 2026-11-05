/**
 * 기준 입력(1990-05-12 23:20 서울 남자)의 계산 결과를 고정한다. 23:20은 자시 경계(23:30)에서 10분 거리라
 * 라이브러리가 경계를 바꾸면 여기서 깨져야 한다. 값은 2026-11-04 리뷰에서 날짜 수 계산으로 따로 검증한 것이다.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { asOfDate, computeSaju, describeChart, normalizePlace } from "../src/chart.js";

const BASE = { date: "1990-05-12", time: "23:20", gender: "M", jasiMethod: "unified" } as const;
const app = createApp();
const post = async (body: object) => (await app.request("/compute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const pillars = (b: Parameters<typeof computeSaju>[0]) => computeSaju(b).pillars.map((p) => p.pillar.ganzi);

describe("기준 입력 1990-05-12 23:20 서울 남", () => {
  it("사주 [시 辛亥, 일 丁丑, 월 辛巳, 년 庚午]", () => {
    expect(pillars(BASE)).toEqual(["辛亥", "丁丑", "辛巳", "庚午"]);
  });
  it("자시 경계: 23:29는 亥시, 23:31은 子시. 통자시면 일주가 다음 날 戊寅, 야자시면 그날 丁丑", () => {
    expect(pillars({ ...BASE, time: "23:29" })).toEqual(["辛亥", "丁丑", "辛巳", "庚午"]);
    expect(pillars({ ...BASE, time: "23:31" })).toEqual(["壬子", "戊寅", "辛巳", "庚午"]);
    expect(pillars({ ...BASE, time: "23:31", jasiMethod: "split" })).toEqual(["壬子", "丁丑", "辛巳", "庚午"]);
  });
  it("자미두수 음력 1990-4-18, 명궁 午 / 점성술 Sun Taurus 21.6° 4하우스, ASC Capricorn 12.1°", async () => {
    const r = (await post({ ...BASE, asOf: "2026-10-29" })) as { ziwei: { view: { lunar: string; mingGong: string } }; natal: { chartText: string } };
    expect(r.ziwei.view).toMatchObject({ lunar: "1990-4-18", mingGong: "午" });
    expect(r.natal.chartText).toMatch(/^Sun Taurus 21\.6° 4하우스$/m);
    expect(r.natal.chartText).toMatch(/ASC Capricorn 12\.1°/);
  });
  it("한국 좌표는 타임존 이름이 달라도 Asia/Seoul로 계산한다 (부산+Asia/Pyongyang이 시주를 바꾸지 않는다)", () => {
    const place = normalizePlace({ name: "부산", lat: 35.18, lon: 129.08, timezone: "Asia/Pyongyang" });
    expect(place.timezone).toBe("Asia/Seoul");
    expect(pillars({ ...BASE, place })).toEqual(["辛亥", "丁丑", "辛巳", "庚午"]);
  });
  it("입춘 전 기준일에는 세운이 양력 연도 기준임을 밝힌다", () => {
    const text = describeChart(computeSaju(BASE), asOfDate("2027-01-20"));
    expect(text).toContain("입춘(2월 4일경) 전이라 사주 세운으로는 아직 丙午 해로 볼 수 있음");
    expect(describeChart(computeSaju(BASE), asOfDate("2026-10-29"))).not.toContain("입춘");
  });
  it("첫 대한 전인 아이는 자미두수에 현재 대한이 없다", async () => {
    const r = (await post({ date: "2024-03-01", time: "10:00", gender: "M", asOf: "2026-10-29", systems: ["ziwei"] })) as { ziwei: { chartText: string; view: { daxian: { current: boolean }[] } } };
    expect(r.ziwei.view.daxian.some((d) => d.current)).toBe(false);
    expect(r.ziwei.chartText).not.toContain("← 현재");
  });
});

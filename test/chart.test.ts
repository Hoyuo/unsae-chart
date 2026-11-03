import { describe, expect, it } from "vitest";
import { aspectBetween } from "../src/natal.js";
import { ziweiBirthTime } from "../src/ziwei.js";
import { adjustBirthInputToKstWallClock } from "@orrery/core/timezone";
import { completedCombos, computeSaju, describeChart, chartView, fixHyeong, openSamhapPairs, toOrreryInput, InputError, asOfDate, seunOf, strengthOf } from "../src/chart.js";

// 기준일을 고정해 스냅샷이 날짜에 따라 바뀌지 않게 한다
const AS_OF = asOfDate("2026-10-29");
const MALE_1993 = { date: "1993-03-12", time: "09:45", gender: "M", jasiMethod: "unified" } as const;
// 丁卯 일주
const FEMALE_1990 = { date: "1990-05-02", time: "12:00", gender: "F", jasiMethod: "unified" } as const;

describe("명식 계산", () => {
  it("1993-03-12 09:45 남 → 乙巳 / 壬辰 / 乙卯 / 癸酉", () => {
    const saju = computeSaju(MALE_1993);
    expect(saju.pillars.map((p) => p.pillar.ganzi)).toEqual(["乙巳", "壬辰", "乙卯", "癸酉"]);
    expect(describeChart(saju, AS_OF)).toMatchSnapshot();
  });

  it("시간 모름이면 시주는 '시간 미상'", () => {
    const saju = computeSaju({ ...MALE_1993, time: null, gender: "F" });
    expect(saju.pillars[0]!.pillar.ganzi).toBe("??");
    expect(describeChart(saju, AS_OF)).toContain("시주 시간 미상");
    const view = chartView(saju, AS_OF);
    expect(view.pillars[0]).toMatchObject({ unknown: true, stem: null, branch: null });
    expect(view.unknownTime).toBe(true);
    // 시주가 없으면 통근·득세 재료에서도 빠진다
    expect(strengthOf(saju).roots.map((r) => r.pillar)).toEqual(["일주", "월주", "년주"]);
  });

  it("현재 대운 표시 (2026년 → 32세 辛亥)", () => {
    const view = chartView(computeSaju(MALE_1993), AS_OF);
    expect(view.daewoon.find((d) => d.current)).toMatchObject({ age: 32, ganzi: "辛亥", year: 2025 });
  });

  it("존재하지 않는 날짜는 거부", () => {
    expect(() => toOrreryInput({ date: "1993-02-30", time: null, gender: "M", jasiMethod: "unified" })).toThrow(InputError);
  });
});

describe("세운", () => {
  it("2026 丙午, 2027 丁未", () => {
    const seun = seunOf(computeSaju(MALE_1993), AS_OF);
    expect(seun.map((y) => [y.year, y.label, y.ganzi])).toEqual([
      [2026, "올해", "丙午"],
      [2027, "내년", "丁未"],
    ]);
  });

  it("丁 일간 기준 丙=劫財, 午=比肩", () => {
    const saju = computeSaju(FEMALE_1990);
    expect(saju.pillars[1]!.pillar.stem).toBe("丁");
    const [y2026, y2027] = seunOf(saju, AS_OF);
    expect(y2026).toMatchObject({ ganzi: "丙午", stemSipsin: "劫財", branchSipsin: "比肩", unseong: "乾祿" });
    expect(y2027).toMatchObject({ ganzi: "丁未", stemSipsin: "比肩" });
  });

  it("세운 ↔ 원국·대운 관계는 orrery 계산 결과 (壬 일간에 丙 → 천간 沖)", () => {
    const [y2026] = seunOf(computeSaju(MALE_1993), AS_OF);
    expect(y2026!.natalRelations).toContain("일주 천간 丙-壬 沖");
    expect(y2026!.daewoonRelations).toContain("대운 辛亥 천간 丙-辛 合(水)");
  });
});

describe("신강약 재료", () => {
  it("壬 일간 · 卯월 → 실령, 일지 辰 중기 癸로 통근, 년간 癸 劫財 득세 1", () => {
    const st = strengthOf(computeSaju(MALE_1993));
    expect(st.deukryeong).toEqual({ ok: false, monthBranch: "卯", mainStem: "乙", sipsin: "傷官" });
    expect(st.roots.find((r) => r.pillar === "일주")!.roots).toEqual(["중기 癸(劫財)"]);
    expect(st.deukse).toEqual({ count: 1, stems: ["년간 癸(劫財)"] });
  });

  it("가중 점수: 월지 지장간 ×1.5, 개수 0이어도 지장간에 있으면 '지장간에만 존재'", () => {
    const st = strengthOf(computeSaju(MALE_1993));
    // 월지 卯 지장간 甲(여기 0.3)·乙(본기 1.0) × 1.5 = 1.95, 월간 乙 1, 시간 乙 1, 일지 辰 여기 乙 0.3 → 木 4.3
    expect(st.weighted.tree).toBe(4.3);
    expect(st.counts).toEqual({ tree: 3, fire: 1, earth: 1, metal: 1, water: 2 });

    // 丙午 丁卯 庚辰 庚午: 水는 개수 0이지만 월지 辰의 중기 癸에 있다 (0.5 × 월지 1.5 = 0.75 → 0.8)
    const f = strengthOf(computeSaju(FEMALE_1990));
    expect(f.counts.water).toBe(0);
    expect(f.weighted.water).toBe(0.8);
    expect(f.hiddenOnly).toEqual(["water"]);
    expect(st.hiddenOnly).toEqual([]);
  });
});

describe("해외 출생 시주", () => {
  it("LA 1985-07-04 14:10 여 → 시주 辛未", () => {
    const place = { name: "로스앤젤레스", lat: 34.05, lon: -118.24, timezone: "America/Los_Angeles" };
    const saju = computeSaju({ date: "1985-07-04", time: "14:10", gender: "F", jasiMethod: "unified", place });
    // @orrery/core 0.4.5는 庚午였다. 0.5.0은 진태양시로 이미 보정한 입력에 한국식 30분 보정(trueSolarTime 옵션 참고)을 더하지 않아 辛未가 된다.
    expect(saju.pillars[0]!.pillar.ganzi).toBe("辛未");
  });
});

describe("관계 교정과 합 계산", () => {
  it("丑戌未 형은 持勢, 子卯 형은 無禮로 낸다", () => {
    const hyeong = [{ type: "刑", detail: "無禮" }] as never;
    expect(fixHyeong(hyeong, "未", "丑")[0]!.detail).toBe("持勢");
    expect(fixHyeong([{ type: "刑", detail: "相刑" }] as never, "子", "卯")[0]!.detail).toBe("無禮");
    expect(fixHyeong([{ type: "刑", detail: "無恩" }] as never, "寅", "巳")[0]!.detail).toBe("無恩");
    expect(fixHyeong([{ type: "沖", detail: null }] as never, "丑", "未")[0]!.detail).toBeNull();
  });
  it("원국 巳·丑에 운의 酉가 들어오면 巳酉丑 삼합 완성", () => {
    expect(completedCombos(["亥", "丑", "巳", "午"], ["酉"]).join()).toContain("巳酉丑 三合(金) 완성");
    expect(completedCombos(["亥", "丑", "巳", "午"], ["卯"]).join()).not.toContain("巳酉丑");
    expect(completedCombos(["巳", "酉", "丑"], ["酉"])).toEqual([]);
  });
  it("왕지 없는 양 끝 짝을 유파 차이로 표시한다", () => {
    expect(openSamhapPairs(["巳", "丑"]).join()).toContain("왕지 酉");
    expect(openSamhapPairs(["巳", "酉"])).toEqual([]);
  });
});

describe("트랜짓 애스펙트", () => {
  it("합·대립·삼각·육각·사각을 각거리대로 낸다", () => {
    expect(aspectBetween(100, 100)?.en).toMatch(/conjunction/i);
    expect(aspectBetween(280, 100)?.en).toMatch(/opposition/i);
    expect(aspectBetween(220, 100)?.en).toMatch(/trine/i);
    expect(aspectBetween(1, 359)?.en).toMatch(/conjunction/i);
    expect(aspectBetween(190, 100)?.en).toMatch(/square/i);
    expect(aspectBetween(145, 100)).toBeNull();
  });
});

describe("세운의 합", () => {
  it("그 해의 글자가 기여한 합만 그 해의 사건이다", () => {
    expect(completedCombos(["亥", "子"], ["午", "丑"], "午")).toEqual([]);
    expect(completedCombos(["巳", "丑"], ["酉", "午"], "酉").join()).toContain("巳酉丑");
  });
});

describe("자미두수 시각은 사주와 같은 경계를 쓴다", () => {
  const t = (time: string, jasi?: string, tz: string | null = "Asia/Seoul", date = "1990-05-12") => {
    const r = ziweiBirthTime(date, time, tz, jasi);
    return `${r.month}/${r.day} ${r.hour}:${String(r.minute).padStart(2, "0")}`;
  };
  it("한국 출생은 30분 당긴다", () => {
    expect(t("23:20")).toBe("5/12 22:50"); // 사주도 亥시
    expect(t("10:15")).toBe("5/12 9:45");
    expect(t("01:30")).toBe("5/12 1:00"); // 丑시 시작
  });
  it("子시 날짜는 자시법을 따른다", () => {
    expect(t("23:40")).toBe("5/13 0:10"); // 통자시는 다음 날
    expect(t("23:40", "split")).toBe("5/12 23:10"); // 야자시는 그날 밤
    expect(t("00:10")).toBe("5/12 0:10");
    expect(t("01:10")).toBe("5/12 0:59"); // 아직 子시
    expect(t("23:50", undefined, "Asia/Seoul", "1990-12-31")).toBe("1/1 0:20");
  });
  it("해외 출생은 그대로 둔다", () => {
    expect(t("23:20", undefined, "America/New_York")).toBe("5/12 23:20");
  });
  it("서머타임 출생은 KST로 바꾼 뒤 경계를 잰다", () => {
    // createChart가 받은 값을 다시 KST로 바꾸므로, 그 결과가 사주와 같은 시여야 한다
    const k = (date: string, time: string, jasi?: string) => {
      const r = adjustBirthInputToKstWallClock({ ...ziweiBirthTime(date, time, "Asia/Seoul", jasi), gender: "M" });
      return `${r.month}/${r.day} ${r.hour}:${String(r.minute).padStart(2, "0")}`;
    };
    expect(k("1988-07-01", "00:40")).toBe("7/1 0:10"); // KST 6/30 23:40 → 통자시는 7/1 子시
    expect(k("1988-07-01", "00:40", "split")).toBe("6/30 23:10"); // 야자시는 6/30 밤
    expect(k("1988-07-01", "23:40")).toBe("7/1 22:10"); // KST 22:40 亥시
    expect(k("1987-07-01", "00:10")).toBe("6/30 22:40"); // KST 6/30 23:10 亥시
    expect(k("1990-05-12", "23:20")).toBe("5/12 22:50"); // 평소에는 그대로
  });
  it("표준시를 되돌린 밤의 겹친 시각은 표시한다", () => {
    expect(ziweiBirthTime("1954-03-20", "23:40", "Asia/Seoul").ambiguous).toBe(true);
    expect(ziweiBirthTime("1954-03-20", "22:40", "Asia/Seoul").ambiguous).toBeUndefined();
    expect(ziweiBirthTime("1990-05-12", "23:20", "Asia/Seoul").ambiguous).toBeUndefined();
    // 1987·88 서머타임이 끝난 새벽은 겹쳐도 같은 시진이라 알리지 않는다
    expect(ziweiBirthTime("1987-10-11", "03:10", "Asia/Seoul").ambiguous).toBeUndefined();
    expect(ziweiBirthTime("1988-10-09", "03:00", "Asia/Seoul").ambiguous).toBeUndefined();
  });
  it("기준 출생의 자미두수가 亥시 기준으로 계산된다", () => {
    expect(ziweiBirthTime("1990-05-12", "23:20", "Asia/Seoul").hour).toBe(22);
  });
});

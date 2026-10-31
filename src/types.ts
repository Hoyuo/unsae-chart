/**
 * 입력 스키마와 응답 타입. 이 패키지는 저장소의 다른 코드에 의존하지 않는다.
 */
import { z } from "zod";

/** 출생지. 국내 도시는 timezone 생략 가능(Asia/Seoul), 해외는 IANA 타임존 필수 */
export const PlaceSchema = z.object({
  name: z.string().trim().min(1).max(60),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(64).default("Asia/Seoul"),
});
export type Place = z.infer<typeof PlaceSchema>;

export const SEOUL: Place = { name: "서울", lat: 37.5665, lon: 126.978, timezone: "Asia/Seoul" };

export const SYSTEMS = ["saju", "ziwei", "natal"] as const;
export type SystemId = (typeof SYSTEMS)[number];

export const BirthInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다."),
  /** null/생략이면 시간 미상 */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time은 HH:MM 형식이어야 합니다.")
    .nullish(),
  gender: z.enum(["M", "F"]),
  jasiMethod: z.enum(["unified", "split"]).default("unified"),
  /** 없으면 서울 */
  place: PlaceSchema.optional(),
  /** date가 음력이면 "lunar". 서버가 양력으로 바꿔서 쓴다 (기본 양력) */
  calendar: z.enum(["solar", "lunar"]).optional(),
  /** 음력 윤달인가 (calendar가 lunar일 때만 의미가 있다) */
  leapMonth: z.boolean().optional(),
});
export type BirthInput = z.infer<typeof BirthInputSchema>;

/** POST /compute 요청: 출생 정보 + 기준일(생략하면 오늘, 한국 기준) + 계산할 체계(생략하면 전부) */
export const ComputeRequestSchema = BirthInputSchema.extend({
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "asOf는 YYYY-MM-DD 형식이어야 합니다.")
    .optional(),
  systems: z.array(z.enum(SYSTEMS)).min(1).optional(),
});
export type ComputeRequest = z.infer<typeof ComputeRequestSchema>;

// ── 명식 (화면용) ─────────────────────────────────────────
export type Element = "tree" | "fire" | "earth" | "metal" | "water";

export interface Glyph {
  char: string;
  kr: string;
  element: Element;
}

export interface PillarView {
  name: string;
  unknown: boolean;
  stem: (Glyph & { yinyang: "+" | "-" }) | null;
  branch: Glyph | null;
  stemSipsin: string;
  branchSipsin: string;
  unseong: string;
  sinsal: string;
  jigang: string;
}

export interface DaewoonView {
  age: number;
  year: number;
  ganzi: string;
  kr: string;
  stemSipsin: string;
  branchSipsin: string;
  unseong: string;
  current: boolean;
}

export interface SeunView {
  year: number;
  label: "올해" | "내년";
  ganzi: string;
  kr: string;
  stemSipsin: string;
  branchSipsin: string;
  unseong: string;
  /** 세운 ↔ 원국 각 주 관계 */
  natalRelations: string[];
  /** 세운 ↔ 현재 대운 관계 */
  daewoonRelations: string[];
}

export interface StrengthView {
  deukryeong: { ok: boolean; monthBranch: string; mainStem: string; sipsin: string };
  roots: { pillar: string; branch: string; roots: string[] }[];
  deukse: { count: number; stems: string[] };
  /** (a) 천간+지지 본기 개수 */
  counts: Record<Element, number>;
  /** (b) 지장간 포함 가중 점수 */
  weighted: Record<Element, number>;
  /** 개수는 0인데 지장간에만 있는 오행 */
  hiddenOnly: Element[];
}

export interface ChartView {
  gender: "M" | "F";
  unknownTime: boolean;
  pillars: PillarView[];
  elements: Record<Element, number>;
  relations: string[];
  sals: string[];
  gongmang: string[];
  daewoon: DaewoonView[];
  thisYear: number;
  asOf?: string;
  seun?: SeunView[];
  strength?: StrengthView;
}

export interface ZiweiView {
  lunar: string;
  mingGong: string;
  shenGong: string;
  wuXingJu: string;
  palaces: { name: string; ganZhi: string; stars: { name: string; brightness: string; siHua: string }[]; isShenGong: boolean }[];
  daxian: { ageStart: number; ageEnd: number; palaceName: string; ganZhi: string; mainStars: string[]; current: boolean }[];
  liunian: { year: number; label: string; ganZhi: string; mingGongZhi: string; natalPalaceAtMing: string; siHuaPalaces: Record<string, string> }[];
}

export interface NatalView {
  place: Place;
  planets: { id: string; name: string; sign: string; signName: string; degree: number; house: number | null; retrograde: boolean }[];
  angles: { asc: string; mc: string } | null;
  elements: Record<string, number>;
  modes: Record<string, number>;
  aspects: { p1: string; p2: string; type: string; orb: number }[];
  transits: { year: number; label: string; items: string[] }[];
}

/** 해석 결과를 대조할 정답 (자동 검사용) */
export interface Facts {
  system: SystemId;
  thisYear: number;
  nextYear: number;
  /** 올해·내년 세운 간지 */
  yearGanzi: { thisYear: string; nextYear: string };
  unknownTime: boolean;
  /** 차트 텍스트 */
  chartText: string;
  /** 사주: 원국·대운·세운에서 실제로 존재하는 관계 */
  relations?: { a: string; b: string; type: string }[];
  /** 사주: 삼합·방합이 있으면 합 계열 쌍을 느슨하게 허용 */
  looseHap?: boolean;
  /** 사주: 지지 → 지장간 ("戊丙甲") */
  hiddenStems?: Record<string, string>;
  /** 자미두수: 궁 이름 → 그 궁의 성요 이름 */
  palaces?: Record<string, string[]>;
  /** 점성술: 출생 애스펙트 + 트랜짓 애스펙트 */
  aspects?: { p1: string; p2: string; type: string }[];
}

// ── POST /compute 응답 ────────────────────────────────────
export interface SajuOut {
  chartText: string;
  view: ChartView;
  facts: Facts;
  /** 시·일·월·년 순서의 간지. 시간 미상이면 시주는 null */
  pillars: (string | null)[];
}
export interface ZiweiOut {
  chartText: string;
  view: ZiweiView;
  facts: Facts;
}
export interface NatalOut {
  chartText: string;
  view: NatalView;
  facts: Facts;
}
export interface ComputeResponse {
  /** 음력 입력을 양력으로 바꾼 출생 정보 */
  birth: { date: string; time: string | null; gender: "M" | "F"; jasiMethod: "unified" | "split"; place: Place };
  asOf: { date: string; year: number };
  saju?: SajuOut;
  /** 시간 미상이면 null (자미두수는 출생 시가 필수) */
  ziwei?: ZiweiOut | null;
  natal?: NatalOut;
}

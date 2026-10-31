declare module "lunar-javascript" {
  interface Solar {
    toYmd(): string;
    getLunar(): Lunar;
  }
  interface Lunar {
    /** 윤달이면 월이 음수 */
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getSolar(): Solar;
  }
  export const Lunar: { fromYmd(year: number, month: number, day: number): Lunar };
}

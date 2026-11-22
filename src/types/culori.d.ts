declare module 'culori' {
    export type Color =
        | {
              mode?: string;
              r?: number;
              g?: number;
              b?: number;
              h?: number;
              s?: number;
              l?: number;
              c?: number;
              a?: number;
              alpha?: number;
          }
        | undefined;
    export function converter(mode: string): (color: Color | string) => Color;
    export function formatHex(color: Color | string): string | undefined;
    export function parse(color: string): Color;
}

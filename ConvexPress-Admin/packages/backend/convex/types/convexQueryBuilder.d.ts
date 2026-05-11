export {};

declare global {
  type ConvexQueryBuilder = {
    eq(fieldName: string, value: unknown): ConvexQueryBuilder;
    eq(left: unknown, right: unknown): unknown;
    lt(fieldName: string, value: unknown): ConvexQueryBuilder;
    lt(left: unknown, right: unknown): unknown;
    lte(fieldName: string, value: unknown): ConvexQueryBuilder;
    lte(left: unknown, right: unknown): unknown;
    gt(fieldName: string, value: unknown): ConvexQueryBuilder;
    gt(left: unknown, right: unknown): unknown;
    gte(fieldName: string, value: unknown): ConvexQueryBuilder;
    gte(left: unknown, right: unknown): unknown;
    field(fieldName: string): unknown;
    and(...expressions: unknown[]): unknown;
    or(...expressions: unknown[]): unknown;
  };
}

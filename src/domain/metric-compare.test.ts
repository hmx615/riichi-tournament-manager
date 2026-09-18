import { describe, expect, it } from "vitest";
import { COMPARE_METRIC_FIELDS, METRIC_GROUPS, formatMetricDelta, formatMetricValue, metricDirection, metricTone, pickCompareMetrics } from "./metric-compare";

describe("metric groups", () => {
  it("三列指标都在方向表里有明确处理", () => {
    expect(METRIC_GROUPS.map((group) => group.metrics.length)).toEqual([10, 10, 10]);
    for (const field of COMPARE_METRIC_FIELDS) {
      expect(["higher", "lower", null]).toContain(metricDirection(field));
    }
  });

  it("只把对比用得到的字段发给客户端", () => {
    const picked = pickCompareMetrics({ 和牌率: 0.3, 对局数: 95, 一位率: 0.32 });
    expect(Object.keys(picked)).toHaveLength(COMPARE_METRIC_FIELDS.length);
    expect(picked["和牌率"]).toBe(0.3);
    expect(picked["对局数"]).toBeUndefined();
    // 缺失字段补 null，保证两边结构一致。
    expect(picked["被炸率"]).toBeNull();
  });
});

describe("metric direction", () => {
  it("把用户确认过的方向记下来", () => {
    // 追立率、流听率、立直率按确认结果都算越大越好。
    for (const field of ["和牌率", "追立率", "流听率", "立直率", "局收支", "立直好型率"]) {
      expect(metricDirection(field)).toBe("higher");
    }
    for (const field of ["放铳率", "被炸率", "平均铳点", "平均起手向听", "平均立直巡目", "和了巡数"]) {
      expect(metricDirection(field)).toBe("lower");
    }
  });

  it("打法风格类指标不判优劣", () => {
    for (const field of ["副露率", "默听率", "立直后流局率", "副露后流局率"]) {
      expect(metricDirection(field)).toBeNull();
      expect(metricTone(field, 0.5, 0.2)).toBeNull();
    }
  });
});

describe("metric tone", () => {
  it("按方向判断优劣", () => {
    expect(metricTone("和牌率", 0.3, 0.2)).toBe("better");
    expect(metricTone("和牌率", 0.2, 0.3)).toBe("worse");
    expect(metricTone("放铳率", 0.1, 0.2)).toBe("better");
    expect(metricTone("放铳率", 0.2, 0.1)).toBe("worse");
  });

  it("打平与缺失都不染色", () => {
    expect(metricTone("和牌率", 0.25, 0.25)).toBeNull();
    expect(metricTone("和牌率", null, 0.25)).toBeNull();
    expect(metricTone("和牌率", 0.25, undefined)).toBeNull();
    expect(metricTone("和牌率", Number.NaN, 0.25)).toBeNull();
  });
});

describe("formatting", () => {
  it("按类型显示数值", () => {
    expect(formatMetricValue(0.1234, "rate")).toBe("12.34%");
    expect(formatMetricValue(8.616, "decimal")).toBe("8.62");
    expect(formatMetricValue(1651.4, "point")).toBe("1,651");
    expect(formatMetricValue(null, "point")).toBe("-");
  });

  it("差值带单位和符号，缺失或打平不显示", () => {
    expect(formatMetricDelta("rate", 0.3, 0.2)).toBe("+10.00 pt");
    expect(formatMetricDelta("point", 1651, 1421)).toBe("+230");
    expect(formatMetricDelta("point", 900, 1421)).toBe("-521");
    expect(formatMetricDelta("decimal", 8.616, 8.5)).toBe("+0.12");
    expect(formatMetricDelta("rate", 0.3, 0.3)).toBeNull();
    expect(formatMetricDelta("rate", null, 0.3)).toBeNull();
  });
});

import { AssetRule } from '../assetrule'
import { DataRule } from '../datarule'
import { GlobalRule } from '../globalrule'
import { PageRule, RulePathMode } from '../pagerule'
import { SiteRule } from '../siterule'
import { TemplateRule } from '../templaterule'

type Rule = AssetRule|DataRule|GlobalRule|PageRule|SiteRule|TemplateRule

type RuleWithPath = AssetRule|PageRule

const comparePathsMap = {
  [RulePathMode.SELF]: {
    [RulePathMode.SELF]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => ruleA.path === ruleB.path,
    [RulePathMode.SELFANDSUB]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => ruleB.path.startsWith(ruleA.path),
    [RulePathMode.SUB]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => ruleA.path !== ruleB.path && ruleB.path.startsWith(ruleA.path)
  },
  [RulePathMode.SELFANDSUB]: {
    [RulePathMode.SELF]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => false,
    [RulePathMode.SELFANDSUB]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => ruleB.path.startsWith(ruleA.path),
    [RulePathMode.SUB]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => ruleA.path !== ruleB.path && ruleB.path.startsWith(ruleA.path)
  },
  [RulePathMode.SUB]: {
    [RulePathMode.SELF]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => false,
    [RulePathMode.SELFANDSUB]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => ruleB.path.startsWith(ruleA.path),
    [RulePathMode.SUB]: (ruleA: RuleWithPath, ruleB: RuleWithPath) => ruleB.path.startsWith(ruleA.path)
  }
}

export function comparePathsWithMode (ruleA: RuleWithPath, ruleB: RuleWithPath) {
  return comparePathsMap[ruleB.mode][ruleA.mode](ruleA, ruleB)
}

export function tooPowerfulHelper <R extends Rule> (rule: R, rules: R[], asOrMorePowerful: (ruleA: R, ruleB: R) => boolean) {
  const asPowerfulRules = rules.filter(r => asOrMorePowerful(r, rule))
  const grants: Record<string, boolean> = {}
  for (const r of asPowerfulRules) {
    for (const [key, value] of Object.entries(r.grants)) grants[key] ||= value
  }
  return Object.entries(rule.grants).some(([key, value]) => value && !grants[key])
}

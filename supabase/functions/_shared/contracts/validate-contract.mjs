#!/usr/bin/env node
// Runs a prompt-contract/v1 YAML file against a real directive string.
//
// This exists to answer one question honestly: is the YAML a specification, or is it
// decoration? It is a specification only if something can execute it. This is that
// something, in about sixty lines and with no dependencies beyond a YAML parser.
//
//   node validate-contract.mjs bridge-arrival-directive.yaml /path/to/sprint-kickoff.ts
//
// Exit code 0 = every assertion holds. 1 = at least one failed.

import { readFileSync } from "node:fs";
import { parse } from "yaml";

const [, , contractPath, sourcePath] = process.argv;
if (!contractPath || !sourcePath) {
  console.error("usage: validate-contract.mjs <contract.yaml> <source-file>");
  process.exit(2);
}

const contract = parse(readFileSync(contractPath, "utf8"));
const source = readFileSync(sourcePath, "utf8");

// Pull each directive's string out of the exported DIRECTIVES record. Deliberately
// crude: the contract is about the words, so reading them as text is the point.
function extractVariant(key) {
  const re = new RegExp(`\\b${key}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m");
  const m = source.match(re);
  return m ? m[1] : null;
}

const variants = Object.fromEntries(
  contract.subject.variants.map((v) => [v.key, extractVariant(v.key)]),
);

for (const [k, v] of Object.entries(variants)) {
  if (v === null) {
    console.error(`could not find variant "${k}" in ${sourcePath}`);
    process.exit(2);
  }
}

const targets = (on) => (on === "all" ? Object.keys(variants) : [on]);
const hit = (text, pattern) => new RegExp(pattern, "i").test(text);

let failures = 0;
for (const a of contract.assertions) {
  const checks = [
    ...targets(a.on).map((k) => ({ variant: k, must: a.must_match, mustNot: a.must_not_match })),
    ...(a.additional ?? []).map((x) => ({
      variant: x.on, must: x.must_match, mustNot: x.must_not_match,
    })),
  ];

  const problems = [];
  for (const c of checks) {
    for (const p of c.must ?? []) {
      if (!hit(variants[c.variant], p)) problems.push(`${c.variant}: missing /${p}/`);
    }
    for (const p of c.mustNot ?? []) {
      if (hit(variants[c.variant], p)) problems.push(`${c.variant}: must not contain /${p}/`);
    }
  }

  if (problems.length) {
    failures++;
    console.log(`FAIL  ${a.id}  ${a.name}`);
    for (const p of problems) console.log(`        ${p}`);
  } else {
    console.log(`pass  ${a.id}  ${a.name}`);
  }
}

console.log(`\n${contract.assertions.length - failures}/${contract.assertions.length} assertions hold`);
process.exit(failures ? 1 : 0);

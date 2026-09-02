import test from "node:test";
import assert from "node:assert/strict";

import { createInbreedingCalculator, pedigreeCompleteness } from "@/lib/breeding/inbreeding";
import {
  ancestryDiversity,
  classifyRelationship,
  siblingKind,
  type PedigreeIndex,
  type PedigreeNode,
} from "@/lib/breeding/pedigree";

/**
 * The inbreeding engine is checked against pairings whose coefficients are
 * fixed by the genetics, not by this implementation: a full-sib mating is
 * F = 0.25 in any correct system, a half-sib 0.125, first cousins 0.0625. If
 * these drift, the breeding recommendations are wrong in a way no amount of
 * UI testing would reveal.
 */

let counter = 0;

function makeIndex(
  specs: { id: string; sex: "MALE" | "FEMALE"; mother?: string; father?: string; born?: number }[]
): PedigreeIndex {
  const index: PedigreeIndex = new Map();
  for (const spec of specs) {
    const node: PedigreeNode = {
      id: spec.id,
      tagNumber: spec.id,
      name: null,
      sex: spec.sex,
      // Birth order drives which side the kinship recursion expands, so each
      // animal gets a date derived from its declared generation.
      dateOfBirth: new Date(2020 + (spec.born ?? 0), 0, 1 + counter++),
      motherId: spec.mother ?? null,
      fatherId: spec.father ?? null,
    };
    index.set(spec.id, node);
  }
  return index;
}

test("unrelated founders produce non-inbred offspring", () => {
  const index = makeIndex([
    { id: "A", sex: "FEMALE" },
    { id: "B", sex: "MALE" },
  ]);
  const calc = createInbreedingCalculator(index);
  assert.equal(calc.offspringInbreeding("B", "A"), 0);
});

test("full-sibling mating gives F = 0.25", () => {
  const index = makeIndex([
    { id: "DAM", sex: "FEMALE", born: 0 },
    { id: "SIRE", sex: "MALE", born: 0 },
    { id: "X", sex: "FEMALE", mother: "DAM", father: "SIRE", born: 1 },
    { id: "Y", sex: "MALE", mother: "DAM", father: "SIRE", born: 1 },
  ]);
  const calc = createInbreedingCalculator(index);
  assert.equal(siblingKind(index, "X", "Y"), "FULL");
  assert.equal(calc.offspringInbreeding("Y", "X"), 0.25);
});

test("half-sibling mating gives F = 0.125", () => {
  const index = makeIndex([
    { id: "DAM1", sex: "FEMALE", born: 0 },
    { id: "DAM2", sex: "FEMALE", born: 0 },
    { id: "SIRE", sex: "MALE", born: 0 },
    { id: "X", sex: "FEMALE", mother: "DAM1", father: "SIRE", born: 1 },
    { id: "Y", sex: "MALE", mother: "DAM2", father: "SIRE", born: 1 },
  ]);
  const calc = createInbreedingCalculator(index);
  assert.equal(siblingKind(index, "X", "Y"), "PATERNAL_HALF");
  assert.equal(calc.offspringInbreeding("Y", "X"), 0.125);
});

test("parent-offspring mating gives F = 0.25", () => {
  const index = makeIndex([
    { id: "DAM", sex: "FEMALE", born: 0 },
    { id: "SIRE", sex: "MALE", born: 0 },
    { id: "DAUGHTER", sex: "FEMALE", mother: "DAM", father: "SIRE", born: 1 },
  ]);
  const calc = createInbreedingCalculator(index);
  assert.equal(calc.offspringInbreeding("SIRE", "DAUGHTER"), 0.25);
  assert.equal(classifyRelationship(index, "SIRE", "DAUGHTER").kind, "PARENT_OFFSPRING");
});

test("first-cousin mating gives F = 0.0625", () => {
  const index = makeIndex([
    { id: "GD", sex: "FEMALE", born: 0 },
    { id: "GS", sex: "MALE", born: 0 },
    // Two full-sib offspring of the grandparents...
    { id: "P1", sex: "FEMALE", mother: "GD", father: "GS", born: 1 },
    { id: "P2", sex: "MALE", mother: "GD", father: "GS", born: 1 },
    // ...each mated to an unrelated outside animal.
    { id: "OUT_M", sex: "MALE", born: 1 },
    { id: "OUT_F", sex: "FEMALE", born: 1 },
    { id: "C1", sex: "FEMALE", mother: "P1", father: "OUT_M", born: 2 },
    { id: "C2", sex: "MALE", mother: "OUT_F", father: "P2", born: 2 },
  ]);
  const calc = createInbreedingCalculator(index);
  assert.equal(calc.offspringInbreeding("C2", "C1"), 0.0625);
});

test("an inbred common ancestor raises F above the naive path value", () => {
  // X and Y are half sibs through SIRE, and SIRE is himself the product of a
  // full-sib mating (F_SIRE = 0.25). The half-sib figure of 0.125 assumes an
  // outbred common ancestor; the (1 + F_A) term pushes it to 0.15625.
  const index = makeIndex([
    { id: "GD", sex: "FEMALE", born: 0 },
    { id: "GS", sex: "MALE", born: 0 },
    { id: "S1", sex: "FEMALE", mother: "GD", father: "GS", born: 1 },
    { id: "S2", sex: "MALE", mother: "GD", father: "GS", born: 1 },
    { id: "SIRE", sex: "MALE", mother: "S1", father: "S2", born: 2 },
    { id: "DAM1", sex: "FEMALE", born: 2 },
    { id: "DAM2", sex: "FEMALE", born: 2 },
    { id: "X", sex: "FEMALE", mother: "DAM1", father: "SIRE", born: 3 },
    { id: "Y", sex: "MALE", mother: "DAM2", father: "SIRE", born: 3 },
  ]);
  const calc = createInbreedingCalculator(index);
  assert.equal(calc.inbreedingOf("SIRE"), 0.25);
  assert.equal(calc.offspringInbreeding("Y", "X"), 0.125 * (1 + 0.25));
});

test("an animal with one unknown parent has F = 0", () => {
  const index = makeIndex([
    { id: "DAM", sex: "FEMALE", born: 0 },
    { id: "X", sex: "FEMALE", mother: "DAM", born: 1 },
  ]);
  const calc = createInbreedingCalculator(index);
  assert.equal(calc.inbreedingOf("X"), 0);
});

test("a cyclic pedigree terminates instead of hanging", () => {
  // Bad data: A is recorded as its own grandparent.
  const index = makeIndex([
    { id: "A", sex: "FEMALE", mother: "B", born: 2 },
    { id: "B", sex: "FEMALE", mother: "A", born: 1 },
    { id: "C", sex: "MALE", born: 0 },
  ]);
  const calc = createInbreedingCalculator(index);
  assert.equal(typeof calc.offspringInbreeding("C", "A"), "number");
});

test("pedigree completeness reports how much ancestry is actually known", () => {
  const index = makeIndex([
    { id: "MGM", sex: "FEMALE", born: 0 },
    { id: "DAM", sex: "FEMALE", mother: "MGM", born: 1 },
    { id: "SIRE", sex: "MALE", born: 1 },
    { id: "X", sex: "FEMALE", mother: "DAM", father: "SIRE", born: 2 },
  ]);
  // Over 2 generations there are 6 slots (2 parents + 4 grandparents); 3 are
  // filled: dam, sire, and the maternal grandmother.
  assert.equal(pedigreeCompleteness(index, "X", 2), 3 / 6);
});

test("ancestry diversity separates shared family trees from unrelated ones", () => {
  const shared = makeIndex([
    { id: "GD", sex: "FEMALE", born: 0 },
    { id: "GS", sex: "MALE", born: 0 },
    { id: "P1", sex: "FEMALE", mother: "GD", father: "GS", born: 1 },
    { id: "P2", sex: "MALE", mother: "GD", father: "GS", born: 1 },
  ]);
  assert.equal(ancestryDiversity(shared, "P1", "P2"), 0);

  const distinct = makeIndex([
    { id: "A1", sex: "FEMALE", born: 0 },
    { id: "A2", sex: "MALE", born: 0 },
    { id: "B1", sex: "FEMALE", born: 0 },
    { id: "B2", sex: "MALE", born: 0 },
    { id: "P1", sex: "FEMALE", mother: "A1", father: "A2", born: 1 },
    { id: "P2", sex: "MALE", mother: "B1", father: "B2", born: 1 },
  ]);
  assert.equal(ancestryDiversity(distinct, "P1", "P2"), 1);
});

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { optionalString, requireBoolean, requireString } from "@/lib/validation";

/**
 * Supplier CRUD. Suppliers live under the feed module because feed is where
 * they are actually used — a delivery names one, and a contamination notice
 * arrives from one.
 */

function readForm(formData: FormData) {
  return {
    name: requireString(formData, "name"),
    contact: optionalString(formData, "contact"),
    phone: optionalString(formData, "phone"),
    address: optionalString(formData, "address"),
    notes: optionalString(formData, "notes"),
    isActive: requireBoolean(formData, "isActive"),
  };
}

function revalidateSupplier(id?: string) {
  revalidatePath("/feed/suppliers");
  revalidatePath("/feed/types");
  revalidatePath("/feed/deliveries");
  if (id) revalidatePath(`/feed/suppliers/${id}`);
}

export async function createSupplier(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const data = readForm(formData);

  const existing = await prisma.supplier.findFirst({
    where: { farmId, name: data.name },
    select: { id: true },
  });
  if (existing) throw new Error(`A supplier called "${data.name}" already exists`);

  await prisma.supplier.create({ data: { ...data, farmId } });
  revalidateSupplier();
  redirect("/feed/suppliers");
}

export async function updateSupplier(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.supplier.findFirst({ where: { id, farmId }, select: { id: true } });
  if (!existing) throw new Error("Supplier not found");

  const data = readForm(formData);
  const clash = await prisma.supplier.findFirst({
    where: { farmId, name: data.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new Error(`A supplier called "${data.name}" already exists`);

  await prisma.supplier.update({ where: { id }, data });
  revalidateSupplier(id);
  redirect("/feed/suppliers");
}

export async function setSupplierActive(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");
  const isActive = requireBoolean(formData, "isActive");

  const existing = await prisma.supplier.findFirst({ where: { id, farmId }, select: { id: true } });
  if (!existing) throw new Error("Supplier not found");

  await prisma.supplier.update({ where: { id }, data: { isActive } });
  revalidateSupplier(id);
}

/**
 * Deleting a supplier would `SetNull` the link on every batch it delivered,
 * which is the one field a recall notice is matched against. Refused while any
 * batch or feed type still points at it.
 */
export async function deleteSupplier(formData: FormData) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const id = requireString(formData, "id");

  const existing = await prisma.supplier.findFirst({
    where: { id, farmId },
    select: { id: true, name: true, _count: { select: { feedTypes: true, feedBatches: true } } },
  });
  if (!existing) throw new Error("Supplier not found");

  const { feedTypes, feedBatches } = existing._count;
  if (feedTypes > 0 || feedBatches > 0) {
    throw new Error(
      `"${existing.name}" is linked to ${feedTypes} feed type(s) and ${feedBatches} delivery/deliveries. Mark them inactive instead — deleting would break the recall trail.`
    );
  }

  await prisma.supplier.delete({ where: { id } });
  revalidateSupplier();
  redirect("/feed/suppliers");
}

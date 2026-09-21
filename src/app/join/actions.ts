"use server";

import {
  clubRegistrationSchema,
  firstRegistrationError,
  registrationValues,
} from "@/domain/club-registration";
import { createClubRegistration } from "@/server/club-registration-repository";

export type RegistrationFormState = {
  status: "idle" | "error" | "success";
  message: string;
  values?: Record<string, string>;
};

function returnedValues(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(([key, value]) => key !== "website" && typeof value === "string")
      .map(([key, value]) => [key, value as string]),
  );
}

export async function submitRegistrationAction(
  _state: RegistrationFormState,
  formData: FormData,
): Promise<RegistrationFormState> {
  // Real users never see this field. Treat filled submissions as successful so bots cannot tune around it.
  if (String(formData.get("website") || "").trim()) {
    return { status: "success", message: "信息已提交" };
  }

  const parsed = clubRegistrationSchema.safeParse(registrationValues(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: firstRegistrationError(parsed.error),
      values: returnedValues(formData),
    };
  }

  try {
    await createClubRegistration(parsed.data);
    return { status: "success", message: "信息已提交" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const expectedMessage = message === "该学号已提交过信息"
      || message === "该雀魂 ID 已提交过信息"
      || message === "该学号或雀魂 ID 已提交过信息";
    if (!expectedMessage) console.error("Club registration failed", error);
    return {
      status: "error",
      message: expectedMessage ? message : "提交失败，请稍后再试",
      values: returnedValues(formData),
    };
  }
}

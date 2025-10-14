"use client";

import { useState, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { addToWaitlist, sendJoiningEmail } from "@/actions/waitlist";
import { z } from "zod";

type FormState = "idle" | "submitting" | "success";

const emailSchema = z.object({
  email: z.email("Please enter a valid email address"),
});

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (formState !== "idle") return;

      const trimmedEmail = email.trim();

      const validation = emailSchema.safeParse({ email: trimmedEmail });
      if (!validation.success) {
        toast.error(validation.error.issues[0].message);
        return;
      }

      setFormState("submitting");

      try {
        // Без внешних запросов: передаём заглушечный IP
        const ip = "0.0.0.0";
        addToWaitlist(trimmedEmail, ip)
          .then(async (result) => {
            if (result.isNewEmail) {
              toast.promise(sendJoiningEmail(trimmedEmail), {
                loading: "Wait a sec, adding you to waitlist...",
                success: "Boom, You're in!",
              });
            } else {
              toast.success("You're already on the waitlist!");
            }
            setFormState("success");
          })
          .catch((error) => {
            setFormState("idle");
            if (error instanceof Error) {
              toast.error(error.message);
            } else {
              toast.error("Failed to join waitlist");
            }
          });
      } catch (error) {
        setFormState("idle");

        if (error instanceof Error) {
          toast.error(error.message);
        } else {
          toast.error("Something went wrong. Please try again.");
        }
      }
    },
    [email, formState],
  );

  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value);
    },
    [],
  );

  const isSubmitting = formState === "submitting";
  const isSuccess = formState === "success";
  const isDisabled = isSubmitting || isSuccess;

  return (
    <div className="flex flex-col md:flex-row gap-4 md:justify-end">
      <Input
        className="w-full md:w-96 rounded-none dark:bg-background/40"
        placeholder="grishinium@gmail.com"
        value={email}
        onChange={handleEmailChange}
        disabled={isDisabled}
        type="email"
        autoComplete="email"
        aria-label="Email address"
      />
      <Button
        onClick={handleSubmit}
        className="rounded-none w-full sm:w-30 transition-transform duration-150 will-change-transform hover:scale-[1.02] active:scale-95"
        disabled={isDisabled}
        type="submit"
      >
        {isSuccess ? "Subscribed " : "Subscribe"}
      </Button>
    </div>
  );
}

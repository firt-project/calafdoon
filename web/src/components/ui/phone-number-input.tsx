"use client";

import { forwardRef } from "react";
import PhoneInput, { type Country, type Value } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { phoneDefaultCountry } from "@/lib/phone";

const PhoneInputField = forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => (
  <Input
    {...props}
    ref={ref}
    type="tel"
    inputMode="tel"
    autoComplete="tel"
    className={cn("h-14 rounded-2xl text-lg px-5", className)}
  />
));
PhoneInputField.displayName = "PhoneInputField";

export interface PhoneNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  profileCountry?: string;
  defaultCountry?: Country;
  placeholder?: string;
  className?: string;
  large?: boolean;
}

export function PhoneNumberInput({
  value,
  onChange,
  profileCountry,
  defaultCountry,
  placeholder,
  className,
  large = true,
}: PhoneNumberInputProps) {
  const country = defaultCountry ?? phoneDefaultCountry(profileCountry);

  return (
    <PhoneInput
      international
      countryCallingCodeEditable={false}
      defaultCountry={country}
      flags={flags}
      value={(value || undefined) as Value | undefined}
      onChange={(next) => onChange(next ?? "")}
      inputComponent={PhoneInputField}
      placeholder={placeholder}
      className={cn(
        "PhoneInput",
        large ? "PhoneInput--large" : "PhoneInput--compact",
        className
      )}
    />
  );
}

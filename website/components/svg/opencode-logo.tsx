import type { SVGProps } from "react";

export function OpenCodeLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="32"
      height="40"
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="OpenCode"
      {...props}
    >
      <path className="fill-neutral-200 dark:fill-[#4B4646]" d="M24 32H8V16H24V32Z" />
      <path className="fill-neutral-800 dark:fill-[#F1ECEC]" d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" />
    </svg>
  );
}

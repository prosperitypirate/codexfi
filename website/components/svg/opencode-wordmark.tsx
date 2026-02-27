import type { SVGProps } from "react";

export function OpenCodeWordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="234"
      height="42"
      viewBox="0 0 234 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="OpenCode"
      {...props}
    >
      <g clipPath="url(#opencode-wordmark-clip)">
        {/* Inner squares — light grey in light mode, dark in dark mode */}
        <path className="fill-neutral-400 dark:fill-[#4B4646]" d="M18 30H6V18H18V30Z" />
        <path className="fill-neutral-400 dark:fill-[#4B4646]" d="M48 30H36V18H48V30Z" />
        <path className="fill-neutral-400 dark:fill-[#4B4646]" d="M84 24V30H66V24H84Z" />
        <path className="fill-neutral-400 dark:fill-[#4B4646]" d="M108 36H96V18H108V36Z" />
        <path className="fill-neutral-400 dark:fill-[#4B4646]" d="M144 30H126V18H144V30Z" />
        <path className="fill-neutral-400 dark:fill-[#4B4646]" d="M168 30H156V18H168V30Z" />
        <path className="fill-neutral-400 dark:fill-[#4B4646]" d="M198 30H186V18H198V30Z" />
        <path className="fill-neutral-400 dark:fill-[#4B4646]" d="M234 24V30H216V24H234Z" />

        {/* Outer letter shapes — light in dark mode, dark in light mode */}
        <path
          className="fill-neutral-700 dark:fill-[#B7B1B1]"
          d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z"
        />
        <path
          className="fill-neutral-700 dark:fill-[#B7B1B1]"
          d="M36 30H48V12H36V30ZM54 36H36V42H30V6H54V36Z"
        />
        <path
          className="fill-neutral-700 dark:fill-[#B7B1B1]"
          d="M84 24H66V30H84V36H60V6H84V24ZM66 18H78V12H66V18Z"
        />
        <path
          className="fill-neutral-700 dark:fill-[#B7B1B1]"
          d="M108 12H96V36H90V6H108V12ZM114 36H108V12H114V36Z"
        />
        <path
          className="fill-neutral-800 dark:fill-[#F1ECEC]"
          d="M144 12H126V30H144V36H120V6H144V12Z"
        />
        <path
          className="fill-neutral-800 dark:fill-[#F1ECEC]"
          d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z"
        />
        <path
          className="fill-neutral-800 dark:fill-[#F1ECEC]"
          d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z"
        />
        <path
          className="fill-neutral-800 dark:fill-[#F1ECEC]"
          d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z"
        />
      </g>
      <defs>
        <clipPath id="opencode-wordmark-clip">
          <rect width="234" height="42" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

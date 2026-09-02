import type {
  TableHTMLAttributes,
  HTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from "react";

export type TableProps = TableHTMLAttributes<HTMLTableElement>;

export function Table({ className = "", ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full text-left text-sm ${className}`} {...props} />
    </div>
  );
}

export type TheadProps = HTMLAttributes<HTMLTableSectionElement>;

export function Thead({ className = "", ...props }: TheadProps) {
  return (
    <thead
      className={`border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 ${className}`}
      {...props}
    />
  );
}

export type TbodyProps = HTMLAttributes<HTMLTableSectionElement>;

export function Tbody({ className = "", ...props }: TbodyProps) {
  return (
    <tbody
      className={`divide-y divide-zinc-100 dark:divide-zinc-800 ${className}`}
      {...props}
    />
  );
}

export type TrProps = HTMLAttributes<HTMLTableRowElement>;

export function Tr({ className = "", ...props }: TrProps) {
  return <tr className={`${className}`} {...props} />;
}

export type ThProps = ThHTMLAttributes<HTMLTableCellElement>;

export function Th({ className = "", ...props }: ThProps) {
  return <th className={`px-3 py-2 font-medium ${className}`} {...props} />;
}

export type TdProps = TdHTMLAttributes<HTMLTableCellElement>;

export function Td({ className = "", ...props }: TdProps) {
  return (
    <td
      className={`px-3 py-2 text-zinc-800 dark:text-zinc-200 ${className}`}
      {...props}
    />
  );
}

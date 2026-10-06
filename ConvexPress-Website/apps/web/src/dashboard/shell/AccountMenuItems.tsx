import { Fragment } from 'react';
import { Link } from '@tanstack/react-router';
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { resolveIcon } from '../icons';
import { badgeCountFor, formatBadge, type NavItem } from '../nav';

/** Account menus retain every authored destination, including grouped descendants. */
export function AccountMenuItems({ items, badges = null, depth = 0 }: { items: NavItem[]; badges?: Record<string, number> | null; depth?: number }) {
  return items.map(item => {
    if (item.kind === 'heading') return <DropdownMenuGroup key={item.id}>
      <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
      <AccountMenuItems items={item.children} badges={badges} depth={depth} />
    </DropdownMenuGroup>;
    if (item.kind === 'separator') return <Fragment key={item.id}><DropdownMenuSeparator /><AccountMenuItems items={item.children} badges={badges} depth={depth} /></Fragment>;
    const Icon = resolveIcon(item.icon);
    const count = badgeCountFor(item, badges);
    return <Fragment key={item.id}>
      <DropdownMenuItem style={{ paddingInlineStart: 12 + Math.min(depth, 4) * 12 }} render={item.external ? <a href={item.href} target={item.target} rel={item.rel} /> : <Link to={item.href} />}>
        <Icon className="size-4" aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        {count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{formatBadge(count)}</span>}
      </DropdownMenuItem>
      <AccountMenuItems items={item.children} badges={badges} depth={depth + 1} />
    </Fragment>;
  });
}

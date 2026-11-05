import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, ChevronRight, HandCoins, Languages, PiggyBank, Plane, Repeat, Settings, Shapes, Target, Users, Wallet } from 'lucide-react';
import { Card, IconTile, PageHeader } from '@/components/ui';
import { AccountCard } from '@/components/Account';
import { BrandBanner, MadeBy } from '@/components/Brand';

export function MorePage() {
  const { t } = useTranslation();
  const groups = [
    [
      { to: '/accounts', icon: Wallet, label: t('nav.accounts'), color: '#2a78d6' },
      { to: '/categories', icon: Shapes, label: t('nav.categories'), color: '#eb6834' },
      { to: '/budgets', icon: PiggyBank, label: t('nav.budgets'), color: '#1baf7a' },
      { to: '/goals', icon: Target, label: t('nav.goals'), color: '#6250d6' },
    ],
    [
      { to: '/debts', icon: HandCoins, label: t('nav.debts'), color: '#e34948' },
      { to: '/split', icon: Users, label: t('nav.split'), color: '#e87ba4' },
      { to: '/bills', icon: Bell, label: t('nav.bills'), color: '#eda100' },
      { to: '/recurring', icon: Repeat, label: t('nav.recurring'), color: '#0e9bb5' },
      { to: '/trips', icon: Plane, label: t('nav.trips'), color: '#008300' },
    ],
    [
      { to: '/settings', icon: Settings, label: t('nav.settings'), color: '#7a7f87' },
      { to: '/settings/languages', icon: Languages, label: t('lang.editor'), color: '#8a6d3b' },
    ],
  ];
  return (
    <div>
      <PageHeader title={t('nav.more')} />
      <div className="space-y-3">
        <AccountCard />
        {groups.map((g, i) => (
          <Card key={i} className="!p-1.5">
            {g.map((x) => (
              <Link key={x.to} to={x.to} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-ink/5">
                <IconTile color={x.color} size={38}><x.icon size={19} /></IconTile>
                <span className="flex-1 font-medium">{x.label}</span>
                <ChevronRight size={18} className="text-muted rtl:rotate-180" />
              </Link>
            ))}
          </Card>
        ))}
      </div>
      <BrandBanner className="mx-auto mt-8 w-56 opacity-90" />
      <MadeBy coBrand className="mx-auto mt-4 w-fit" />
    </div>
  );
}

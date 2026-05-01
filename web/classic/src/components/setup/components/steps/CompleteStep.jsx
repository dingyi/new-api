/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Card, Chip } from '@heroui/react';
import { CheckCircle2, Database, KeyRound, Rocket, Settings2 } from 'lucide-react';

/**
 * 完成步骤组件
 * 显示配置总结和初始化确认界面
 */
const CompleteStep = ({
  setupStatus,
  formData,
  renderNavigationButtons,
  t,
}) => {
  const summaryItems = [
    {
      label: t('数据库类型'),
      icon: Database,
      value:
        setupStatus.database_type === 'sqlite'
          ? 'SQLite'
          : setupStatus.database_type === 'mysql'
            ? 'MySQL'
            : 'PostgreSQL',
    },
    {
      label: t('管理员账号'),
      icon: KeyRound,
      value: setupStatus.root_init
        ? t('已初始化')
        : formData.username || t('未设置'),
    },
    {
      label: t('使用模式'),
      icon: Settings2,
      value:
        formData.usageMode === 'external'
          ? t('对外运营模式')
          : formData.usageMode === 'self'
            ? t('自用模式')
            : t('演示站点模式'),
    },
  ];

  return (
    <div>
      {/*
        Layout mirrors DatabaseStep's info card so the four steps share
        one visual grammar: `h-12` filled icon on the left, heading + an
        inline chip + description column on the right. The previous
        treatment used a `h-14` rocket on an emerald gradient with the
        chip stacked above a `text-2xl` title — louder than every other
        step in the wizard, and the chip / title / description weren't
        sharing a left edge. Keeping the green tint for the "success
        ready" semantic but dialing it down to a tinted card so it doesn't
        outshout the actual call-to-action button below.
      */}
      <Card className='mb-3 rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30'>
        <div className='flex items-start gap-4'>
          <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white'>
            <Rocket size={24} />
          </div>
          <div className='min-w-0'>
            <div className='mb-2 flex flex-wrap items-center gap-2'>
              <h3 className='text-lg font-semibold text-foreground'>
                {t('准备完成初始化')}
              </h3>
              <Chip variant='tertiary' color='success' className='w-fit'>
                <CheckCircle2 size={14} />
                {t('准备就绪')}
              </Chip>
            </div>
            <p className='text-sm leading-6 text-foreground'>
              {t('请确认以下设置信息，点击"初始化系统"开始配置')}
            </p>
          </div>
        </div>
      </Card>

      <div className='grid grid-cols-1 gap-3 text-left sm:grid-cols-3'>
        {summaryItems.map((item) => {
          const Icon = item.icon;

          return (
          <Card
            key={item.label}
            className='rounded-3xl border border-border bg-background/80 p-4'
          >
            <div className='mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-secondary text-muted'>
              <Icon size={20} />
            </div>
            <div className='text-xs leading-tight text-muted'>
              {item.label}
            </div>
            <div className='mt-0.5 text-sm font-semibold leading-tight text-foreground'>
              {item.value}
            </div>
          </Card>
          );
        })}
      </div>

      {renderNavigationButtons && renderNavigationButtons()}
    </div>
  );
};

export default CompleteStep;

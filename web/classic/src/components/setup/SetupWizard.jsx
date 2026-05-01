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

import React, { useEffect, useState } from 'react';
import { Card } from '@heroui/react';
import { Check, CheckCircle2, Database, KeyRound, Settings2 } from 'lucide-react';
import { API, showError, showNotice } from '../../helpers';
import { useTranslation } from 'react-i18next';

import StepNavigation from './components/StepNavigation';
import DatabaseStep from './components/steps/DatabaseStep';
import AdminStep from './components/steps/AdminStep';
import UsageModeStep from './components/steps/UsageModeStep';
import CompleteStep from './components/steps/CompleteStep';

// Visual stepper rendered above each step's body. Mirrors the v3 default
// frontend's onboarding pattern (`web/default/src/features/setup/setup-wizard.tsx`)
// but in HeroUI / Tailwind tokens consistent with the rest of `web/classic`.
//
// Three states per item, picked by index vs `currentStep`:
//   active     — bordered ring, primary-tinted circle showing the step icon
//   completed  — primary border + tint, circle shows a check glyph
//   pending    — muted border + neutral surface, circle shows the step number
//
// Lays out as a 4-column grid on >= sm so all steps stay in one row; collapses
// to a single column on mobile to keep title/description readable.
// Selected/completed surfaces fill via inline style (`var(--app-primary)`)
// rather than `bg-primary`/`border-primary` Tailwind utilities — this fork's
// Tailwind JIT does not emit those rules into the bundle (verified: 0 hits
// in compiled CSS). The same workaround is documented inside UsageModeStep.
function SetupStepper({ steps, currentStep, t }) {
  const cardStyle = (isActive, isCompleted) => {
    if (isActive) {
      return {
        borderColor: 'var(--app-primary)',
        boxShadow: '0 0 0 2px color-mix(in srgb, var(--app-primary) 20%, transparent)',
        backgroundColor: 'var(--app-background)',
      };
    }
    if (isCompleted) {
      return {
        // Dark border tracks the dark glyph inside the completed step's
        // circle; user explicitly asked for it. Kept the 40% transparency
        // from the original cyan tint so completed reads quieter than
        // active (which still uses a saturated cyan border + ring).
        borderColor: 'color-mix(in srgb, #0a0a0a 40%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--app-primary) 5%, transparent)',
      };
    }
    return null; // Tailwind classes handle the pending state
  };

  const circleStyle = (isActive, isCompleted) => {
    if (isActive || isCompleted) {
      return {
        borderColor: 'var(--app-primary)',
        backgroundColor: 'var(--app-primary)',
        // Dark glyph on cyan, matching the selected mode-card icon and
        // this fork's `.button--primary` convention (cyan + near-black
        // text). Hardcoded near-black because `--app-primary-foreground`
        // is empty in this fork and `var(--app-foreground)` would flip
        // with the theme even though cyan stays theme-stable.
        color: '#0a0a0a',
      };
    }
    return null;
  };

  return (
    <ol className='grid gap-2.5 sm:grid-cols-4'>
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        const Icon = step.icon;

        return (
          <li
            key={step.title}
            className={`rounded-2xl border p-3 transition-colors ${
              isActive || isCompleted ? '' : 'border-border bg-background/60'
            }`}
            style={cardStyle(isActive, isCompleted) || undefined}
          >
            <div className='flex items-start gap-3'>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  isActive || isCompleted
                    ? ''
                    : 'border-border bg-surface-secondary text-muted'
                }`}
                style={circleStyle(isActive, isCompleted) || undefined}
                aria-hidden='true'
              >
                {isCompleted ? (
                  <Check size={14} strokeWidth={3} />
                ) : isActive ? (
                  <Icon size={14} />
                ) : (
                  index + 1
                )}
              </span>
              <div className='min-w-0 space-y-0.5'>
                <p
                  className={`text-sm font-semibold ${
                    isActive || isCompleted ? 'text-foreground' : 'text-muted'
                  }`}
                >
                  {step.title}
                </p>
                <p className='text-xs leading-snug text-muted'>
                  {step.description}
                </p>
              </div>
            </div>
            <span className='sr-only'>
              {isCompleted
                ? t('已完成')
                : isActive
                  ? t('进行中')
                  : t('待处理')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const SetupWizard = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [setupStatus, setSetupStatus] = useState({
    status: false,
    root_init: false,
    database_type: '',
  });
  const [currentStep, setCurrentStep] = useState(0);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    usageMode: 'external',
  });

  // 定义步骤内容
  const steps = [
    {
      title: t('数据库检查'),
      description: t('验证数据库连接状态'),
      icon: Database,
    },
    {
      title: t('管理员账号'),
      description: t('设置管理员登录信息'),
      icon: KeyRound,
    },
    {
      title: t('使用模式'),
      description: t('选择系统运行模式'),
      icon: Settings2,
    },
    {
      title: t('完成初始化'),
      description: t('确认设置并完成初始化'),
      icon: CheckCircle2,
    },
  ];

  useEffect(() => {
    fetchSetupStatus();
  }, []);

  const fetchSetupStatus = async () => {
    try {
      const res = await API.get('/api/setup');
      const { success, data } = res.data;
      if (success) {
        setSetupStatus(data);

        // If setup is already completed, redirect to home
        if (data.status) {
          window.location.href = '/';
          return;
        }

        // 设置当前步骤 - 默认从数据库检查开始
        setCurrentStep(0);
      } else {
        showError(t('获取初始化状态失败'));
      }
    } catch (error) {
      console.error('Failed to fetch setup status:', error);
      showError(t('获取初始化状态失败'));
    }
  };

  const handleUsageModeChange = (e) => {
    const nextMode = e?.target?.value ?? e;
    setFormData((prev) => ({ ...prev, usageMode: nextMode }));
  };

  const next = () => {
    // 验证当前步骤是否可以继续
    if (!canProceedToNext()) {
      return;
    }

    const current = currentStep + 1;
    setCurrentStep(current);
  };

  // 验证是否可以继续到下一步
  const canProceedToNext = () => {
    switch (currentStep) {
      case 0: // 数据库检查步骤
        return true; // 数据库检查总是可以继续
      case 1: // 管理员账号步骤
        if (setupStatus.root_init) {
          return true; // 如果已经初始化，可以继续
        }
        // 检查必填字段
        if (
          !formData.username ||
          !formData.password ||
          !formData.confirmPassword
        ) {
          showError(t('请填写完整的管理员账号信息'));
          return false;
        }
        if (formData.password !== formData.confirmPassword) {
          showError(t('两次输入的密码不一致'));
          return false;
        }
        if (formData.password.length < 8) {
          showError(t('密码长度至少为8个字符'));
          return false;
        }
        return true;
      case 2: // 使用模式步骤
        if (!formData.usageMode) {
          showError(t('请选择使用模式'));
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const prev = () => {
    const current = currentStep - 1;
    setCurrentStep(current);
  };

  const onSubmit = async () => {
    // For root_init=false, validate admin username and password
    if (!setupStatus.root_init) {
      if (!formData.username || !formData.username.trim()) {
        showError(t('请输入管理员用户名'));
        return;
      }

      if (!formData.password || formData.password.length < 8) {
        showError(t('密码长度至少为8个字符'));
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        showError(t('两次输入的密码不一致'));
        return;
      }
    }

    // Prepare submission data
    const formValues = { ...formData };
    const usageMode = formData.usageMode;
    formValues.SelfUseModeEnabled = usageMode === 'self';
    formValues.DemoSiteEnabled = usageMode === 'demo';

    // Remove usageMode as it's not needed by the backend
    delete formValues.usageMode;

    // 提交表单至后端
    setLoading(true);

    try {
      const res = await API.post('/api/setup', formValues);
      const { success, message } = res.data;

      if (success) {
        showNotice(t('系统初始化成功，正在跳转...'));
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }

      // Backend declined the submission. The most common cause is a
      // staleness race: another tab or an earlier session already
      // finished setup (so backend's `constant.Setup` is true), but
      // this tab's cached `setupStatus` still says status:false and
      // walked the user through every step. Re-poll /api/setup; if
      // it now reports status:true, treat the failure as "already
      // done elsewhere" and redirect quietly — showing the raw
      // 系统已经初始化完成 error here would imply user-facing fault
      // and leaves them stuck on the wizard with no working action.
      try {
        const recheck = await API.get('/api/setup');
        if (recheck.data?.success && recheck.data?.data?.status) {
          showNotice(t('系统已初始化，正在跳转...'));
          setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        }
      } catch {
        // Fall through to surface the original error message below.
      }

      showError(message || t('初始化失败，请重试'));
    } catch (error) {
      console.error('API error:', error);
      showError(t('系统初始化失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  // 获取步骤内容
  const getStepContent = (step) => {
    switch (step) {
      case 0:
        return <DatabaseStep setupStatus={setupStatus} t={t} />;
      case 1:
        return (
          <AdminStep
            setupStatus={setupStatus}
            formData={formData}
            setFormData={setFormData}
            t={t}
          />
        );
      case 2:
        return (
          <UsageModeStep
            formData={formData}
            handleUsageModeChange={handleUsageModeChange}
            t={t}
          />
        );
      case 3:
        return (
          <CompleteStep setupStatus={setupStatus} formData={formData} t={t} />
        );
      default:
        return null;
    }
  };

  const stepNavigationProps = {
    currentStep,
    steps,
    prev,
    next,
    onSubmit,
    loading,
    t,
  };

  return (
    // Layout: PageLayout strips its global header/sidebar on /setup, so the
    // wizard owns the full viewport. Vertical padding is symmetric (`py-12`)
    // because there's no longer a fixed top nav to dodge — the wizard centres
    // itself around the viewport midpoint regardless of card height.
    <div className='relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_28%),var(--app-background)] px-4 py-12 sm:px-6'>
      <div className='pointer-events-none absolute left-[-120px] top-20 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl' />
      <div className='pointer-events-none absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl' />

      <div className='relative mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-4xl items-center'>
        <div className='min-w-0 w-full'>
          <Card className='rounded-[2rem] border border-border bg-background/88 p-5 shadow-[0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-8'>
            <SetupStepper steps={steps} currentStep={currentStep} t={t} />
            <div className='steps-content mt-6'>
              {React.cloneElement(getStepContent(currentStep), {
                ...stepNavigationProps,
                renderNavigationButtons: () => (
                  <StepNavigation {...stepNavigationProps} />
                ),
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;

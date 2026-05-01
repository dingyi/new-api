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
import {
  Button,
  Card,
  Checkbox,
  InputGroup,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  Separator,
  TextField,
  useOverlayState,
} from '@heroui/react';

export function AuthPage({ children, turnstile }) {
  return (
    // `min-h-full flex flex-col` makes the auth page fill <main>'s
    // available height inside PageLayout's flex-1 content wrapper,
    // so the inner column below can centre the form vertically AND
    // still leave the footer pinned to the viewport bottom. Earlier
    // we hard-coded `min-h-[calc(100vh-108px)]` + `mt-[60px]` to
    // dodge a fixed header — PageLayout's header is now part of the
    // flex stack, so those magic numbers stretched the auth shell
    // taller than its parent and pushed the footer below the fold.
    <div className='relative flex min-h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.15),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.18),transparent_24%),var(--app-background)] px-4 py-12 sm:px-6 lg:px-8'>
      <div
        className='blur-ball blur-ball-indigo'
        style={{ top: '-80px', right: '-80px', transform: 'none' }}
      />
      <div className='blur-ball blur-ball-teal' style={{ top: '50%', left: '-120px' }} />
      <div className='relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center'>
        {children}
        {turnstile ? <div className='mt-6 flex justify-center'>{turnstile}</div> : null}
      </div>
    </div>
  );
}

export function AuthBrand({ logo, systemName }) {
  return (
    <div className='mb-6 flex items-center justify-center gap-3'>
      <img
        src={logo}
        alt={systemName}
        className='h-11 w-11 rounded-2xl border border-border bg-background p-1.5 shadow-sm'
      />
      <div className='text-xl font-semibold tracking-tight text-foreground'>
        {systemName}
      </div>
    </div>
  );
}

export function AuthPanel({ title, subtitle, children, className = '' }) {
  return (
    <Card className={`w-full rounded-[28px] border border-border bg-background/88 px-5 py-6 shadow-[0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl ${className}`}>
      <div className='mb-6 text-center'>
        <h1 className='text-2xl font-semibold tracking-tight text-foreground'>
          {title}
        </h1>
        {subtitle ? (
          <p className='mt-2 text-sm leading-6 text-muted'>
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

export function AuthDivider({ children }) {
  return (
    <div className='my-5 flex items-center gap-4'>
      <Separator className='flex-1 bg-border' />
      <span className='text-xs font-medium uppercase tracking-[0.22em] text-muted'>
        {children}
      </span>
      <Separator className='flex-1 bg-border' />
    </div>
  );
}

export function AuthAgreement({
  checked,
  onChange,
  hasUserAgreement,
  hasPrivacyPolicy,
  t,
}) {
  if (!hasUserAgreement && !hasPrivacyPolicy) return null;

  return (
    <div className='pt-3'>
      <Checkbox
        isSelected={checked}
        onValueChange={onChange}
        className='items-start'
      >
        <span className='text-sm leading-6 text-muted'>
          {t('我已阅读并同意')}
          {hasUserAgreement ? (
            <a
              href='/user-agreement'
              target='_blank'
              rel='noopener noreferrer'
              className='mx-1 font-medium text-primary transition hover:text-primary/80'
            >
              {t('用户协议')}
            </a>
          ) : null}
          {hasUserAgreement && hasPrivacyPolicy ? t('和') : null}
          {hasPrivacyPolicy ? (
            <a
              href='/privacy-policy'
              target='_blank'
              rel='noopener noreferrer'
              className='mx-1 font-medium text-primary transition hover:text-primary/80'
            >
              {t('隐私政策')}
            </a>
          ) : null}
        </span>
      </Checkbox>
    </div>
  );
}

export function AuthLinkRow({ prefix, linkText, to }) {
  return (
    <div className='mt-6 text-center text-sm text-muted'>
      {prefix}{' '}
      <a href={to} className='font-medium text-primary transition hover:text-primary/80'>
        {linkText}
      </a>
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  className = '',
  ...props
}) {
  return (
    <Button
      variant='primary'
      size='lg'
      className={`h-12 w-full rounded-full font-medium ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
}

export function AuthOutlineButton({
  children,
  className = '',
  ...props
}) {
  return (
    <Button
      variant='outline'
      size='lg'
      className={`h-12 w-full rounded-full border-border bg-background/80 font-medium text-foreground hover:bg-surface-secondary ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
}

export function AuthGhostButton({
  children,
  className = '',
  ...props
}) {
  return (
    <Button
      variant='ghost'
      size='lg'
      className={`h-12 w-full rounded-full font-medium text-muted hover:text-foreground ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
}

export function AuthTextField({
  label,
  icon,
  action,
  className = '',
  inputClassName = '',
  onChange,
  onValueChange,
  name,
  value,
  defaultValue,
  ...props
}) {
  // The form code on this page passes plain `onChange(event)` callbacks
  // (because the previous implementation handed an `<input>` to
  // listeners). HeroUI's TextField prefers `onChange(value: string)`,
  // so bridge: synthesise a minimal event for legacy listeners while
  // also forwarding the raw value to anyone using the new API.
  const handleValueChange = (nextValue) => {
    onValueChange?.(nextValue);
    onChange?.({ target: { name, value: nextValue } });
  };

  return (
    // TextField owns the label-input pairing (a11y + state); InputGroup
    // owns the visual chrome (border / focus ring / hovered state).
    // Replaces a hand-rolled label + absolute-positioned icon overlay +
    // `focus:ring-4` Input that was double-drawing a 4px ring on top of
    // the existing 1px border (visible as "border thickens on focus").
    <TextField
      name={name}
      value={value}
      defaultValue={defaultValue}
      onChange={handleValueChange}
      className={`block ${className}`}
    >
      <Label className='mb-1.5 block text-sm font-medium text-foreground'>
        {label}
      </Label>
      <InputGroup fullWidth className='h-12 rounded-2xl'>
        {icon ? (
          <InputGroup.Prefix className='text-muted'>{icon}</InputGroup.Prefix>
        ) : null}
        <InputGroup.Input
          className={`text-foreground ${inputClassName}`}
          {...props}
        />
        {action ? (
          <InputGroup.Suffix className='pr-1.5'>{action}</InputGroup.Suffix>
        ) : null}
      </InputGroup>
    </TextField>
  );
}

export function AuthModal({
  isOpen,
  onClose,
  title,
  children,
  onConfirm,
  confirmText,
  cancelText,
  isConfirmLoading,
  footer,
  size = 'sm',
  isDismissable = true,
}) {
  const modalState = useOverlayState({
    isOpen,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose?.();
    },
  });

  return (
    <Modal state={modalState}>
      <ModalBackdrop isDismissable={isDismissable} variant='blur'>
        <ModalContainer size={size} placement='center'>
          <ModalDialog className='bg-background/95 backdrop-blur'>
            {title ? (
              <ModalHeader className='border-b border-border'>
                {title}
              </ModalHeader>
            ) : null}
            <ModalBody className='px-6 py-5'>{children}</ModalBody>
            {footer !== null ? (
              <ModalFooter className='border-t border-border'>
                {footer || (
                  <>
                    <Button variant='ghost' onPress={onClose}>
                      {cancelText}
                    </Button>
                    <Button
                      isPending={isConfirmLoading}
                      variant='primary'
                      onPress={onConfirm}
                    >
                      {confirmText}
                    </Button>
                  </>
                )}
              </ModalFooter>
            ) : null}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

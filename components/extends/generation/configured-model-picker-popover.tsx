/**
 * @extends-from components/generation/configured-model-picker-popover.tsx
 * @fork-branch feat/html-slide-design-workbench
 *
 * Shared LLM provider/model picker extracted for generation toolbar and teacher workbench.
 */
'use client';

import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Bot, Brain, Check, Search } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { isLLMProviderConfigured } from '@/lib/store/settings-validation';
import type { ProviderId } from '@/lib/ai/providers';
import type {
  ModelInfo,
  ThinkingConfig,
  ThinkingEffort,
  ThinkingLevel,
} from '@/lib/types/provider';
import type { ProvidersConfig } from '@/lib/types/settings';
import {
  getDefaultThinkingConfig,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';

export interface ConfiguredLlmProvider {
  id: ProviderId;
  name: string;
  icon?: string;
  isServerConfigured?: boolean;
  models: ModelInfo[];
}

export function buildConfiguredLlmProviders(
  providersConfig: ProvidersConfig | undefined,
): ConfiguredLlmProvider[] {
  if (!providersConfig) return [];

  return Object.entries(providersConfig)
    .filter(([, config]) => isLLMProviderConfigured(config))
    .map(([id, config]) => ({
      id: id as ProviderId,
      name: config.name,
      icon: config.icon,
      isServerConfigured: config.isServerConfigured,
      models:
        config.isServerConfigured && !config.apiKey && config.serverModels?.length
          ? config.models.filter((m) => new Set(config.serverModels).has(m.id))
          : config.models,
    }));
}

function formatThinkingValue(value?: string, t?: (key: string) => string) {
  if (!value) return '';
  if (value === 'none') return t ? t('toolbar.off') : 'off';
  if (t && (value === 'dynamic' || value === 'on' || value === 'off' || value === 'auto')) {
    return t(`toolbar.${value}`);
  }
  return value === 'xhigh' ? 'x-high' : value;
}

function formatCompactThinkingValue(value?: string, t?: (key: string) => string) {
  if (!value) return '';
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && value.trim() !== '') {
    return numericValue >= 10000 ? `${Math.round(numericValue / 1000)}k` : `${numericValue}`;
  }
  return formatThinkingValue(value, t);
}

function InlineThinkingControl({
  model,
  config,
  onChange,
  t,
}: {
  model?: ModelInfo;
  config?: ThinkingConfig;
  onChange: (config: ThinkingConfig | undefined) => void;
  t: (key: string) => string;
}) {
  const thinking = model?.capabilities?.thinking;
  if (!supportsConfigurableThinking(thinking)) return null;

  const effective = normalizeThinkingConfig(thinking, config) ?? getDefaultThinkingConfig(thinking);
  const applyConfig = (next: ThinkingConfig) => {
    onChange(normalizeThinkingConfig(thinking, next));
  };

  const applyBudget = (value: number | undefined) => {
    applyConfig({ ...effective, mode: effective?.mode ?? 'enabled', budgetTokens: value });
  };
  const defaultEnabledBudget =
    typeof thinking.defaultBudgetTokens === 'number' && thinking.defaultBudgetTokens > 0
      ? thinking.defaultBudgetTokens
      : (thinking.budgetRange?.step ?? thinking.budgetRange?.min);
  const applyAutoBudget = () => {
    applyConfig({ ...effective, mode: 'auto', enabled: undefined, budgetTokens: -1 });
  };
  const applyBudgetMode = (mode: 'disabled' | 'enabled' | 'auto') => {
    if (mode === 'auto') {
      applyAutoBudget();
      return;
    }

    applyConfig({
      ...effective,
      mode,
      enabled: mode === 'enabled',
      budgetTokens:
        mode === 'enabled' && effective?.budgetTokens === -1
          ? defaultEnabledBudget
          : effective?.budgetTokens,
    });
  };
  const applySimpleMode = (mode: 'disabled' | 'enabled' | 'auto') => {
    applyConfig({
      ...effective,
      mode,
      enabled: mode === 'enabled' ? true : mode === 'disabled' ? false : undefined,
    });
  };

  const selectTriggerCls =
    'h-6 min-w-[84px] rounded-full border-0 bg-violet-100 px-2 py-0 !text-[10px] font-medium leading-none text-violet-700 shadow-none focus-visible:ring-0 data-[size=sm]:h-6 dark:bg-violet-900/40 dark:text-violet-200 [&_svg]:size-3';
  const selectItemCls = 'py-1 text-xs';
  const hasAutoBudget =
    (thinking.control === 'toggle-budget' || thinking.control === 'budget-only') &&
    !!thinking.budgetRange?.allowDynamic;
  const autoBudgetMode =
    effective?.budgetTokens === -1 && thinking.budgetRange?.allowDynamic
      ? 'auto'
      : effective?.mode === 'disabled'
        ? 'disabled'
        : 'enabled';
  const simpleMode =
    thinking.control === 'mode' && effective?.mode === 'auto'
      ? 'auto'
      : effective?.mode === 'disabled'
        ? 'disabled'
        : 'enabled';

  return (
    <div
      className="flex min-w-0 shrink-0 items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Brain className="size-3.5 shrink-0 text-violet-500" />
      <div className="flex min-w-0 items-center gap-0.5 rounded-full border border-violet-200/70 bg-white/65 p-0.5 dark:border-violet-800/70 dark:bg-violet-950/25">
        {hasAutoBudget && (
          <Select
            value={autoBudgetMode}
            onValueChange={(mode) => applyBudgetMode(mode as 'disabled' | 'enabled' | 'auto')}
          >
            <SelectTrigger
              size="sm"
              className="h-6 min-w-[76px] rounded-full border-0 bg-violet-100 px-2 py-0 !text-[10px] font-medium leading-none text-violet-700 shadow-none focus-visible:ring-0 data-[size=sm]:h-6 dark:bg-violet-900/40 dark:text-violet-200 [&_svg]:size-3"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[96px]">
              {thinking.control === 'toggle-budget' && (
                <SelectItem value="disabled" className={selectItemCls}>
                  {t('toolbar.off')}
                </SelectItem>
              )}
              <SelectItem value="enabled" className={selectItemCls}>
                {t('toolbar.on')}
              </SelectItem>
              <SelectItem value="auto" className={selectItemCls}>
                {t('toolbar.auto')}
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        {(thinking.control === 'toggle' ||
          (thinking.control === 'toggle-budget' && !hasAutoBudget) ||
          thinking.control === 'mode') && (
          <Select
            value={simpleMode}
            onValueChange={(mode) => applySimpleMode(mode as 'disabled' | 'enabled' | 'auto')}
          >
            <SelectTrigger
              size="sm"
              className="h-6 min-w-[76px] rounded-full border-0 bg-violet-100 px-2 py-0 !text-[10px] font-medium leading-none text-violet-700 shadow-none focus-visible:ring-0 data-[size=sm]:h-6 dark:bg-violet-900/40 dark:text-violet-200 [&_svg]:size-3"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[96px]">
              {thinking.control === 'mode' && (
                <SelectItem value="auto" className={selectItemCls}>
                  {t('toolbar.auto')}
                </SelectItem>
              )}
              <SelectItem value="disabled" className={selectItemCls}>
                {t('toolbar.off')}
              </SelectItem>
              <SelectItem value="enabled" className={selectItemCls}>
                {t('toolbar.on')}
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        {thinking.control === 'level' && !!thinking.levelValues?.length && (
          <Select
            value={effective?.level ?? thinking.defaultLevel ?? thinking.levelValues[0]}
            onValueChange={(level) =>
              applyConfig({ ...effective, mode: 'enabled', level: level as ThinkingLevel })
            }
          >
            <SelectTrigger size="sm" className={selectTriggerCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[96px]">
              {thinking.levelValues.map((level: ThinkingLevel) => (
                <SelectItem key={level} value={level} className={selectItemCls}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {thinking.control === 'effort' && !!thinking.effortValues?.length && (
          <Select
            value={effective?.effort ?? thinking.defaultEffort ?? thinking.effortValues[0]}
            onValueChange={(effort) =>
              applyConfig({
                ...effective,
                mode: effort === 'none' ? 'disabled' : 'enabled',
                effort: effort as ThinkingEffort,
              })
            }
          >
            <SelectTrigger size="sm" className={selectTriggerCls}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[104px]">
              {thinking.effortValues.map((effort: ThinkingEffort) => (
                <SelectItem key={effort} value={effort} className={selectItemCls}>
                  {formatThinkingValue(effort, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(thinking.control === 'toggle-budget' || thinking.control === 'budget-only') &&
          thinking.budgetRange &&
          (!hasAutoBudget || autoBudgetMode === 'enabled') && (
            <label className="ml-0.5 grid h-6 shrink-0 grid-cols-[auto_60px] items-stretch overflow-hidden rounded-full border border-violet-200/70 bg-background dark:border-violet-800/70">
              <span className="grid h-[22px] shrink-0 place-items-center border-r border-violet-200/70 bg-muted/30 px-2 font-sans text-[11px] font-medium leading-[22px] text-muted-foreground dark:border-violet-800/70">
                {t('toolbar.thinkingBudget')}
              </span>
              <input
                type="text"
                inputMode="numeric"
                aria-label={t('toolbar.thinkingBudget')}
                disabled={effective?.mode === 'disabled'}
                value={
                  typeof effective?.budgetTokens === 'number' && effective.budgetTokens !== -1
                    ? effective.budgetTokens
                    : ''
                }
                placeholder={`${thinking.budgetRange.min}-${thinking.budgetRange.max}`}
                title={`${thinking.budgetRange.min}-${thinking.budgetRange.max} tokens`}
                onChange={(event) => {
                  const rawValue = event.target.value.trim();
                  if (!/^\d*$/.test(rawValue)) return;
                  const value = rawValue ? Number(rawValue) : undefined;
                  applyBudget(value);
                }}
                className="block h-[22px] w-[60px] border-0 bg-transparent px-1 py-0 text-center font-sans text-[11px] font-medium leading-[22px] tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          )}
      </div>
    </div>
  );
}

export interface ConfiguredModelPickerPopoverProps {
  configuredProviders: ConfiguredLlmProvider[];
  providerId: ProviderId | string;
  modelId: string;
  onSelect: (providerId: ProviderId, modelId: string) => void;
  disabled?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
  providerAside?: ReactNode;
  showThinkingControls?: boolean;
  thinkingConfig?: ThinkingConfig;
  onThinkingChange?: (config: ThinkingConfig | undefined) => void;
  /** When set, wraps the trigger with a tooltip (generation toolbar pattern). */
  tooltipContent?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}

export function ConfiguredModelPickerPopover({
  configuredProviders,
  providerId,
  modelId,
  onSelect,
  disabled,
  side = 'top',
  align = 'start',
  className,
  providerAside,
  showThinkingControls = false,
  thinkingConfig,
  onThinkingChange,
  tooltipContent,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  children,
}: ConfiguredModelPickerPopoverProps) {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const popoverOpen = openProp ?? internalOpen;
  const setPopoverOpen = (nextOpen: boolean) => {
    if (openProp === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChangeProp?.(nextOpen);
  };
  const [activeProviderId, setActiveProviderId] = useState<ProviderId | string>(providerId);
  const [searchQuery, setSearchQuery] = useState('');

  const currentProvider = configuredProviders.find((provider) => provider.id === providerId);
  const selectedModel = currentProvider?.models.find((model) => model.id === modelId);

  const searchTerm = searchQuery.trim().toLowerCase();
  const isSearching = searchTerm.length > 0;
  const providerEntries = useMemo(() => {
    const matchesSearch = (model: ModelInfo) =>
      !searchTerm ||
      model.name.toLowerCase().includes(searchTerm) ||
      model.id.toLowerCase().includes(searchTerm);

    return configuredProviders
      .map((provider) => ({
        provider,
        matchingModels: provider.models.filter(matchesSearch),
      }))
      .filter((entry) => !isSearching || entry.matchingModels.length > 0);
  }, [configuredProviders, isSearching, searchTerm]);

  const activeProviderVisible = providerEntries.some(
    (entry) => entry.provider.id === activeProviderId,
  );
  const firstVisibleProviderId = providerEntries[0]?.provider.id;
  const resolvedActiveProviderId =
    isSearching && !activeProviderVisible ? firstVisibleProviderId : activeProviderId;
  const activeProviderEntry =
    providerEntries.find((entry) => entry.provider.id === resolvedActiveProviderId) ??
    providerEntries[0];
  const activeProvider = activeProviderEntry?.provider;

  const visibleModelEntries = useMemo(() => {
    if (!activeProviderEntry) return [];
    const { provider, matchingModels } = activeProviderEntry;
    return matchingModels.map((model) => ({ provider, model }));
  }, [activeProviderEntry]);

  const handleSelect = (nextProviderId: ProviderId, nextModelId: string) => {
    setActiveProviderId(nextProviderId);
    onSelect(nextProviderId, nextModelId);
    setPopoverOpen(false);
  };

  return (
    <Popover
      modal={false}
      open={popoverOpen}
      onOpenChange={(nextOpen) => {
        if (disabled) return;
        setPopoverOpen(nextOpen);
        if (nextOpen) {
          setActiveProviderId(providerId);
          setSearchQuery('');
        }
      }}
    >
      {tooltipContent ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild disabled={disabled}>
              {children}
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{tooltipContent}</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild disabled={disabled}>
          {children}
        </PopoverTrigger>
      )}

      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          'z-[100] w-[640px] max-w-[calc(100vw-2rem)] overflow-hidden p-0',
          className,
        )}
      >
        <div className="grid h-[430px] grid-cols-[128px_minmax(0,1fr)] sm:grid-cols-[160px_minmax(0,1fr)]">
          <div className="min-h-0 border-r bg-muted/20">
            {providerAside ? <div className="px-2 pt-2">{providerAside}</div> : null}
            <div className="px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">
              {t('toolbar.selectProvider')}
            </div>
            <div className="h-[calc(100%-28px)] overflow-y-auto px-2 pb-2 pt-1">
              {providerEntries.length === 0 ? (
                <div className="px-2 py-4 text-[11px] text-muted-foreground">
                  {t('settings.noModelsFound')}
                </div>
              ) : (
                providerEntries.map(({ provider, matchingModels }) => {
                  const isActive = activeProvider?.id === provider.id;
                  const isCurrent = providerId === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setActiveProviderId(provider.id)}
                      className={cn(
                        'mb-1 flex h-10 w-full items-center gap-2 rounded-md px-2 text-left transition-colors',
                        isActive
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/70'
                          : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                      )}
                    >
                      {provider.icon ? (
                        <img
                          src={provider.icon}
                          alt={provider.name}
                          className="size-4 shrink-0 rounded-sm"
                        />
                      ) : (
                        <Bot className="size-4 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{provider.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {isSearching ? `${matchingModels.length}/` : ''}
                          {provider.models.length}
                        </div>
                      </div>
                      {isCurrent && modelId && (
                        <span className="size-1.5 rounded-full bg-violet-500" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="border-b p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => {
                      const nextSearch = event.target.value;
                      setSearchQuery(nextSearch);
                      if (!nextSearch.trim()) setActiveProviderId(providerId);
                    }}
                    placeholder={t('settings.searchModels')}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {visibleModelEntries.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {searchQuery ? t('settings.noModelsFound') : t('settings.noModelsAvailable')}
                </div>
              ) : (
                visibleModelEntries.map(({ provider, model }) => {
                  const isSelected = providerId === provider.id && modelId === model.id;
                  return (
                    <div
                      key={`${provider.id}:${model.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(provider.id, model.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        handleSelect(provider.id, model.id);
                      }}
                      className={cn(
                        'mb-1 flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                        isSelected
                          ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/25 dark:text-violet-300 dark:ring-violet-800'
                          : 'hover:bg-muted/60',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs font-medium">{model.name}</div>
                        {model.id !== model.name && (
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {model.id}
                          </div>
                        )}
                      </div>
                      {showThinkingControls &&
                        isSelected &&
                        selectedModel &&
                        onThinkingChange && (
                          <InlineThinkingControl
                            model={selectedModel}
                            config={thinkingConfig}
                            onChange={onThinkingChange}
                            t={t}
                          />
                        )}
                      {isSelected && (
                        <Check className="size-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { formatCompactThinkingValue, formatThinkingValue };

/**
 * @extends-from components/generation/generation-toolbar.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useState, useRef } from 'react';
import { Bot, Paperclip, FileText, X, Globe2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import { WEB_SEARCH_PROVIDERS, getWebSearchProviderDisplayName } from '@/lib/web-search/constants';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import {
  getThinkingConfigKey,
  getThinkingDisplayValue,
} from '@/lib/ai/thinking-config';
import type { SettingsSection } from '@/lib/types/settings';
import { MediaPopover } from '@/components/generation/media-popover';
import {
  buildConfiguredLlmProviders,
  ConfiguredModelPickerPopover,
  formatCompactThinkingValue,
} from '@components-extends/generation/configured-model-picker-popover';

const MAX_PDF_SIZE_MB = 50;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

export interface GenerationToolbarProps {
  webSearch: boolean;
  onWebSearchChange: (v: boolean) => void;
  onSettingsOpen: (section?: SettingsSection) => void;
  pdfFile: File | null;
  onPdfFileChange: (file: File | null) => void;
  onPdfError: (error: string | null) => void;
}

export function GenerationToolbar({
  webSearch,
  onWebSearchChange,
  onSettingsOpen,
  pdfFile,
  onPdfFileChange,
  onPdfError,
}: GenerationToolbarProps) {
  const { t } = useI18n();
  const currentProviderId = useSettingsStore((s) => s.providerId);
  const currentModelId = useSettingsStore((s) => s.modelId);
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const setModel = useSettingsStore((s) => s.setModel);
  const thinkingConfigs = useSettingsStore((s) => s.thinkingConfigs);
  const setThinkingConfig = useSettingsStore((s) => s.setThinkingConfig);
  const pdfProviderId = useSettingsStore((s) => s.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((s) => s.pdfProvidersConfig);
  const setPDFProvider = useSettingsStore((s) => s.setPDFProvider);
  const webSearchProviderId = useSettingsStore((s) => s.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((s) => s.webSearchProvidersConfig);
  const setWebSearchProvider = useSettingsStore((s) => s.setWebSearchProvider);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const webSearchProvider = WEB_SEARCH_PROVIDERS[webSearchProviderId];
  const webSearchConfig = webSearchProvidersConfig[webSearchProviderId];
  const selectedWebSearchAvailable = webSearchProvider
    ? !webSearchProvider.requiresApiKey ||
      !!webSearchConfig?.apiKey ||
      !!webSearchConfig?.isServerConfigured
    : false;
  const webSearchAvailable = Object.values(WEB_SEARCH_PROVIDERS).some((provider) => {
    const cfg = webSearchProvidersConfig[provider.id];
    return !provider.requiresApiKey || !!cfg?.apiKey || !!cfg?.isServerConfigured;
  });

  const configuredProviders = buildConfiguredLlmProviders(providersConfig);

  const currentProviderConfig = providersConfig?.[currentProviderId];
  const currentModel = currentProviderConfig?.models.find((model) => model.id === currentModelId);
  const currentThinkingConfig =
    thinkingConfigs[getThinkingConfigKey(currentProviderId, currentModelId)];
  const currentProviderName =
    configuredProviders.find((provider) => provider.id === currentProviderId)?.name ??
    currentProviderConfig?.name ??
    currentProviderId;
  const currentProviderIcon =
    configuredProviders.find((provider) => provider.id === currentProviderId)?.icon ??
    currentProviderConfig?.icon;
  const currentModelLabel = currentModel?.name || currentModelId;
  const currentThinkingValue = getThinkingDisplayValue(
    currentModel?.capabilities?.thinking,
    currentThinkingConfig,
  );
  const currentThinkingLabel = formatCompactThinkingValue(currentThinkingValue, t);

  const handleFileSelect = (file: File) => {
    if (file.type !== 'application/pdf') return;
    if (file.size > MAX_PDF_SIZE_BYTES) {
      onPdfError(t('upload.fileTooLarge'));
      return;
    }
    onPdfError(null);
    onPdfFileChange(file);
  };

  const pillCls =
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap border';
  const pillMuted = `${pillCls} border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60`;
  const pillActive = `${pillCls} border-violet-200/60 dark:border-violet-700/50 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300`;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {configuredProviders.length > 0 ? (
        <ConfiguredModelPickerPopover
          configuredProviders={configuredProviders}
          providerId={currentProviderId}
          modelId={currentModelId}
          onSelect={setModel}
          showThinkingControls
          thinkingConfig={currentThinkingConfig}
          onThinkingChange={(config) =>
            setThinkingConfig(currentProviderId, currentModelId, config)
          }
          side="top"
          align="start"
          tooltipContent={`${currentProviderConfig?.name || currentProviderId} / ${currentModelId}`}
        >
          <button
            aria-label={`${currentProviderName} / ${currentModelLabel}`}
            className={cn(
              'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium transition-all',
              'border-violet-200/70 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-300',
              currentModelId &&
                'shadow-[0_0_0_1px_rgba(124,58,237,0.12)] dark:shadow-[0_0_0_1px_rgba(167,139,250,0.16)]',
            )}
          >
            {currentProviderIcon ? (
              <img
                src={currentProviderIcon}
                alt={currentProviderName}
                className="size-4 shrink-0 rounded-sm"
              />
            ) : (
              <Bot className="size-3.5 shrink-0" />
            )}
            {currentThinkingLabel && (
              <span className="shrink-0 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-violet-700 ring-1 ring-violet-200/70 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-800/70">
                {currentThinkingLabel}
              </span>
            )}
          </button>
        </ConfiguredModelPickerPopover>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onSettingsOpen('providers')}
              className={cn(
                pillCls,
                'text-amber-600 dark:text-amber-400 animate-pulse',
                'bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50',
              )}
            >
              <Bot className="size-3.5" />
              <span>{t('toolbar.configureProvider')}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.configureProviderHint')}</TooltipContent>
        </Tooltip>
      )}

      <div className="flex min-w-0 items-center gap-1">
        <div className="w-px h-4 bg-border/60 mx-1" />

        <Popover>
          <PopoverTrigger asChild>
            {pdfFile ? (
              <button className={pillActive}>
                <Paperclip className="size-3.5" />
                <span className="max-w-[100px] truncate">{pdfFile.name}</span>
                <span
                  role="button"
                  className="size-4 rounded-full inline-flex items-center justify-center hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPdfFileChange(null);
                  }}
                >
                  <X className="size-2.5" />
                </span>
              </button>
            ) : (
              <button className={pillMuted}>
                <Paperclip className="size-3.5" />
              </button>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
              <span className="text-xs font-medium text-muted-foreground shrink-0">
                {t('toolbar.pdfParser')}
              </span>
              <Select
                value={pdfProviderId}
                onValueChange={(v) => setPDFProvider(v as PDFProviderId)}
              >
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PDF_PROVIDERS).map((provider) => {
                    const cfg = pdfProvidersConfig[provider.id];
                    const available =
                      !provider.requiresApiKey || !!cfg?.apiKey || !!cfg?.isServerConfigured;
                    return (
                      <SelectItem key={provider.id} value={provider.id} disabled={!available}>
                        <div
                          className={cn('flex items-center gap-1.5', !available && 'opacity-50')}
                        >
                          {provider.icon && (
                            <img src={provider.icon} alt={provider.name} className="w-3.5 h-3.5" />
                          )}
                          {provider.name}
                          {cfg?.isServerConfigured && (
                            <span className="text-[9px] px-1 py-0 rounded border text-muted-foreground">
                              {t('settings.serverConfigured')}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="px-3 pb-3">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = '';
                }}
              />
              {pdfFile ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <FileText className="size-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onPdfFileChange(null)}
                    className="w-full text-xs text-destructive hover:underline text-left"
                  >
                    {t('toolbar.removePdf')}
                  </button>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors cursor-pointer',
                    isDragging
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                      : 'border-muted-foreground/20 hover:border-violet-300',
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                >
                  <Paperclip className="size-5 text-muted-foreground/50 mb-1.5" />
                  <p className="text-xs font-medium">{t('toolbar.pdfUpload')}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {t('upload.pdfSizeLimit')}
                  </p>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {webSearchAvailable ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className={webSearch ? pillActive : pillMuted}>
                <Globe2 className={cn('size-3.5', webSearch && 'animate-pulse')} />
                {webSearch && (
                  <span>
                    {WEB_SEARCH_PROVIDERS[webSearchProviderId]
                      ? getWebSearchProviderDisplayName(webSearchProviderId, t)
                      : 'Search'}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3 space-y-3">
              <button
                onClick={() => {
                  if (!selectedWebSearchAvailable) return;
                  onWebSearchChange(!webSearch);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all',
                  webSearch
                    ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800'
                    : 'border-border hover:bg-muted/50',
                  !selectedWebSearchAvailable && 'opacity-60',
                )}
              >
                <Globe2
                  className={cn(
                    'size-4 shrink-0',
                    webSearch ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">
                    {webSearch ? t('toolbar.webSearchOn') : t('toolbar.webSearchOff')}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {t('toolbar.webSearchDesc')}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground shrink-0">
                  {t('toolbar.webSearchProvider')}
                </span>
                <Select
                  value={webSearchProviderId}
                  onValueChange={(v) => setWebSearchProvider(v as WebSearchProviderId)}
                >
                  <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(WEB_SEARCH_PROVIDERS).map((provider) => {
                      const cfg = webSearchProvidersConfig[provider.id];
                      const available =
                        !provider.requiresApiKey || !!cfg?.apiKey || !!cfg?.isServerConfigured;
                      return (
                        <SelectItem key={provider.id} value={provider.id} disabled={!available}>
                          <div
                            className={cn('flex items-center gap-1.5', !available && 'opacity-50')}
                          >
                            {getWebSearchProviderDisplayName(provider.id, t)}
                            {cfg?.isServerConfigured && (
                              <span className="text-[9px] px-1 py-0 rounded border text-muted-foreground">
                                {t('settings.serverConfigured')}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(pillCls, 'text-muted-foreground/40 cursor-not-allowed')}
                disabled
              >
                <Globe2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('toolbar.webSearchNoProvider')}</TooltipContent>
          </Tooltip>
        )}

        <div className="w-px h-4 bg-border/60 mx-1" />

        <MediaPopover onSettingsOpen={onSettingsOpen} />
      </div>
    </div>
  );
}

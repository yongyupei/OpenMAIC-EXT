/**
 * @extends-from lib/teacher/html-slide-autoplay.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type {
  Action,
  SpeechAction,
  WidgetAnnotationAction,
  WidgetHighlightAction,
  WidgetRevealAction,
  WidgetSetStateAction,
} from '@/lib/types/action';

const WIDGET_ACTION_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface HtmlSlideAutoplayCallbacks {
  playSpeech: (action: SpeechAction) => Promise<void>;
  sendToIframe: (type: string, payload: Record<string, unknown>) => void;
  shouldAbort?: () => boolean;
}

/**
 * Run scene actions sequentially for teacher Studio HTML slide preview:
 * speech actions await completion; widget actions postMessage to the iframe.
 */
export async function runHtmlSlideAutoplay(
  actions: Action[],
  callbacks: HtmlSlideAutoplayCallbacks,
): Promise<void> {
  for (const action of actions) {
    if (callbacks.shouldAbort?.()) return;

    switch (action.type) {
      case 'speech':
        await callbacks.playSpeech(action);
        break;

      case 'widget_highlight':
        callbacks.sendToIframe('HIGHLIGHT_ELEMENT', {
          target: (action as WidgetHighlightAction).target,
        });
        await delay(WIDGET_ACTION_DELAY_MS);
        break;

      case 'widget_setState':
        callbacks.sendToIframe('SET_WIDGET_STATE', {
          state: (action as WidgetSetStateAction).state,
        });
        await delay(WIDGET_ACTION_DELAY_MS);
        break;

      case 'widget_annotation':
        callbacks.sendToIframe('ANNOTATE_ELEMENT', {
          target: (action as WidgetAnnotationAction).target,
        });
        await delay(WIDGET_ACTION_DELAY_MS);
        break;

      case 'widget_reveal':
        callbacks.sendToIframe('REVEAL_ELEMENT', {
          target: (action as WidgetRevealAction).target,
        });
        await delay(WIDGET_ACTION_DELAY_MS);
        break;

      default:
        break;
    }
  }
}

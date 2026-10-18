import { Mic } from 'lucide-solid';
import { useI18n } from '../lib/i18n';
import { Button, Modal } from './ui';

/**
 * Explains voice entries. "confirm" mode (before the first recording) offers Cancel / Start
 * recording; "info" mode is read-only with a single Close button.
 */
export function RecordingInfoDialog(props: {
  open: boolean;
  mode: 'confirm' | 'info';
  onClose(): void;
  onStart?(): void;
}) {
  const { t } = useI18n();
  return (
    <Modal open={props.open} title={t('recording.info.title')} onClose={props.onClose}>
      <ul class="flex list-disc flex-col gap-2 pl-5 text-sm text-muted marker:text-line">
        <li>{t('recording.info.speak')}</li>
        <li>{t('recording.info.privacy')}</li>
        <li>{t('recording.info.appended')}</li>
        <li>{t('recording.info.mood')}</li>
        <li>{t('recording.info.title2')}</li>
      </ul>
      <div class="mt-5 flex justify-end gap-2">
        {props.mode === 'confirm' ? (
          <>
            <Button variant="ghost" onClick={props.onClose}>
              {t('recording.cancel')}
            </Button>
            <Button onClick={() => props.onStart?.()}>
              <Mic class="size-4" aria-hidden="true" />
              {t('recording.begin')}
            </Button>
          </>
        ) : (
          <Button onClick={props.onClose}>{t('recording.info.close')}</Button>
        )}
      </div>
    </Modal>
  );
}

import Swal, { type SweetAlertResult } from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import './alerts.css';

/**
 * Capa única de alertas de Rubrifact sobre SweetAlert2.
 *
 * Toda la app (toasts, confirmaciones y errores) pasa por aquí para que el
 * diseño sea consistente: verde esmeralda + dorado sobre fondo oscuro.
 */

const PALETTE = {
  green: '#046A38',
  greenDark: '#024D28',
  greenLight: '#0A8F4E',
  gold: '#C5A059',
  danger: '#E53E3E',
  success: '#10B981',
  warning: '#F59E0B',
} as const;

const POPUP_CLASSES = {
  container: 'rubri-swal-container',
  popup: 'rubri-swal-popup',
  title: 'rubri-swal-title',
  htmlContainer: 'rubri-swal-text',
  confirmButton: 'rubri-swal-confirm',
  cancelButton: 'rubri-swal-cancel',
  icon: 'rubri-swal-icon',
  timerProgressBar: 'rubri-swal-timer',
} as const;

const TOAST_CLASSES = {
  ...POPUP_CLASSES,
  popup: 'rubri-swal-popup rubri-swal-toast',
  title: 'rubri-swal-title rubri-swal-toast-title',
} as const;

const toast = Swal.mixin({
  toast: true,
  position: 'bottom-end',
  showConfirmButton: false,
  timer: 2800,
  timerProgressBar: true,
  buttonsStyling: false,
  customClass: TOAST_CLASSES,
  didOpen: (element) => {
    element.addEventListener('mouseenter', Swal.stopTimer);
    element.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

const fireToast = (
  icon: 'success' | 'error' | 'warning' | 'info',
  title: string,
  text?: string,
): void => {
  void toast.fire({
    icon,
    iconColor:
      icon === 'error'
        ? PALETTE.danger
        : icon === 'warning'
          ? PALETTE.warning
          : icon === 'info'
            ? PALETTE.gold
            : PALETTE.success,
    title,
    ...(text ? { text } : {}),
    timer: icon === 'error' ? 4200 : 2800,
  });
};

export const notify = {
  success: (title: string, text?: string) => fireToast('success', title, text),
  error: (title: string, text?: string) => fireToast('error', title, text),
  warning: (title: string, text?: string) => fireToast('warning', title, text),
  info: (title: string, text?: string) => fireToast('info', title, text),
};

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  /** Pinta el icono y el botón principal en rojo (acciones destructivas). */
  danger?: boolean;
}

/** Confirmación modal con el diseño de Rubrifact. */
export const confirmAction = async (
  options: ConfirmOptions,
): Promise<boolean> => {
  const result: SweetAlertResult = await Swal.fire({
    title: options.title,
    ...(options.text ? { text: options.text } : {}),
    icon: options.danger ? 'warning' : 'question',
    iconColor: options.danger ? PALETTE.danger : PALETTE.gold,
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? 'Aceptar',
    cancelButtonText: options.cancelText ?? 'Cancelar',
    reverseButtons: true,
    focusCancel: true,
    buttonsStyling: false,
    heightAuto: false,
    backdrop: 'rgba(5, 12, 8, 0.72)',
    customClass: {
      ...POPUP_CLASSES,
      confirmButton: options.danger
        ? 'rubri-swal-confirm rubri-swal-danger'
        : 'rubri-swal-confirm',
    },
  });

  return result.isConfirmed;
};

/** Aviso modal (sin decisión) para errores que el usuario debe leer. */
export const alertError = async (
  title: string,
  text?: string,
): Promise<void> => {
  await Swal.fire({
    title,
    ...(text ? { text } : {}),
    icon: 'error',
    iconColor: PALETTE.danger,
    confirmButtonText: 'Entendido',
    buttonsStyling: false,
    heightAuto: false,
    backdrop: 'rgba(5, 12, 8, 0.72)',
    customClass: POPUP_CLASSES,
  });
};

export default notify;

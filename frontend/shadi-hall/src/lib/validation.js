import { z } from 'zod';

// Client-side checks give instant feedback; the API validates everything again.

export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number');

export const requiredText = (label, max = 200) => z.string().trim().min(1, `${label} is required`).max(max, `Keep it under ${max} characters`);

export const optionalText = (max = 500) => z.string().trim().max(max, `Keep it under ${max} characters`).optional().or(z.literal(''));

export const phone = (label = 'Phone') => z.string().trim().regex(/^\+?[\d\s\-()]{7,20}$/, `Enter a valid ${label.toLowerCase()}`);

export const optionalPhone = (label = 'Phone') => phone(label).optional().or(z.literal(''));

export const optionalEmail = () => z.string().trim().email('Enter a valid email').optional().or(z.literal(''));

export const cnic = () =>
  z
    .string()
    .trim()
    .regex(/^(\d{5}-?\d{7}-?\d)?$/, 'CNIC should look like 35202-1234567-1')
    .optional()
    .or(z.literal(''));

/** Money input value: '' (empty) or a non-negative number. */
export const money = (label = 'Amount', { required = false, positive = false } = {}) =>
  z
    .union([z.number(), z.literal('')])
    .refine((value) => !required || value !== '', `${label} is required`)
    .refine((value) => value === '' || value >= 0, `${label} cannot be negative`)
    .refine((value) => !positive || (value !== '' && value > 0), `${label} must be more than zero`);

export const dateText = (label = 'Date') => z.string().min(1, `${label} is required`);

export const timeText = (label = 'Time') => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} is required`);

export const toNumber = (value) => (value === '' || value === undefined || value === null ? 0 : Number(value));

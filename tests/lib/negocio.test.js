import { describe, it, expect } from 'vitest';
import { NEGOCIO, enlaceWhatsApp } from '@/lib/negocio';

describe('datos del negocio', () => {
  it('el número de WhatsApp está en formato internacional, solo dígitos', () => {
    expect(NEGOCIO.whatsapp).toMatch(/^\d{8,15}$/);
  });

  it('incluye el código de país de Honduras', () => {
    expect(NEGOCIO.whatsapp.startsWith('504')).toBe(true);
  });

  it('el enlace del teléfono es marcable', () => {
    expect(NEGOCIO.telefonoEnlace).toMatch(/^tel:\+?\d+$/);
  });

  it('tiene los datos que muestran el pie y la sección de contacto', () => {
    for (const campo of ['nombre', 'descripcion', 'telefono', 'correo', 'direccion', 'horario']) {
      expect(NEGOCIO[campo]).toBeTruthy();
    }
  });

  // El teléfono se muestra con guiones y el de WhatsApp va en dígitos: son dos
  // campos distintos y se pueden desincronizar al cambiar uno solo. Si eso
  // pasa, la clienta ve un número y le escribe a otro.
  it('el número que se muestra es el mismo que abre WhatsApp', () => {
    const soloDigitos = (texto) => texto.replace(/\D/g, '');

    expect(soloDigitos(NEGOCIO.telefono)).toBe(NEGOCIO.whatsapp);
    expect(soloDigitos(NEGOCIO.whatsappVisible)).toBe(NEGOCIO.whatsapp);
    expect(soloDigitos(NEGOCIO.telefonoEnlace)).toBe(NEGOCIO.whatsapp);
  });

  // Los valores de relleno estuvieron publicados semanas: el botón de WhatsApp
  // abría una conversación con un número que no existe.
  it('no quedó ningún dato de relleno', () => {
    expect(NEGOCIO.whatsapp).not.toBe('50499990000');
    expect(NEGOCIO.telefono).not.toMatch(/9999-0000/);
    expect(NEGOCIO.direccion).not.toBe('Tegucigalpa, Honduras');
  });

  it('el enlace de Instagram apunta al usuario del salón', () => {
    expect(NEGOCIO.instagram).toBeTruthy();
    expect(NEGOCIO.instagram).not.toContain('@');
    expect(NEGOCIO.instagramUrl).toBe(`https://www.instagram.com/${NEGOCIO.instagram}`);
  });
});

describe('enlaceWhatsApp', () => {
  it('arma un enlace wa.me con el número del salón', () => {
    expect(enlaceWhatsApp()).toBe(`https://wa.me/${NEGOCIO.whatsapp}`);
  });

  it('agrega el mensaje como parámetro text', () => {
    const enlace = enlaceWhatsApp('Hola');

    expect(enlace).toBe(`https://wa.me/${NEGOCIO.whatsapp}?text=Hola`);
  });

  it('codifica los saltos de línea, que es como se arma el mensaje', () => {
    const enlace = enlaceWhatsApp('Servicio:\n• Cejas');

    expect(enlace).toContain('%0A');
    expect(enlace).not.toContain('\n');
  });

  it('codifica los acentos y los caracteres reservados', () => {
    const enlace = enlaceWhatsApp('Día preferido: martes & jueves');

    expect(enlace).not.toContain(' ');
    expect(enlace).not.toContain('&t');
    expect(decodeURIComponent(enlace.split('?text=')[1])).toBe('Día preferido: martes & jueves');
  });

  it.each([
    ['una cadena vacía', ''],
    ['undefined', undefined],
    ['null', null]
  ])('sin mensaje (%s) devuelve el enlace simple', (_descripcion, mensaje) => {
    expect(enlaceWhatsApp(mensaje)).toBe(`https://wa.me/${NEGOCIO.whatsapp}`);
  });
});

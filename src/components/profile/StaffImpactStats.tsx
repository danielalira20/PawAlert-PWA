import React from 'react';
import { ImpactStatsBase } from './ImpactStatsBase';
import type { ImpactoStaff } from '../../hooks/useStaffImpact';

interface Props {
  impacto: ImpactoStaff;
  isLoading: boolean;
}

function mensajeCalido(rescatados: number) {
  if (rescatados === 0) return 'Cada caso que atiendes puede salvar una vida.';
  if (rescatados === 1) return 'Gracias a tu trabajo, 1 animalito ha sido rescatado.';
  return `Gracias a tu trabajo, ${rescatados} animalitos han sido rescatados.`;
}

function detalleTexto(total: number, enProceso: number) {
  const base = `Has atendido ${total} ${total === 1 ? 'caso' : 'casos'} en total.`;
  if (enProceso === 0) return `${base} Todos ya se resolvieron.`;
  return `${base} Actualmente tienes ${enProceso} ${enProceso === 1 ? 'caso activo' : 'casos activos'}.`;
}

export function StaffImpactStats({ impacto, isLoading }: Props) {
  return (
    <ImpactStatsBase
      impacto={impacto}
      isLoading={isLoading}
      copy={{
        roleLabel: 'Staff en PawAlert',
        desdePrefijo: 'Activo',
        mensajeCalido,
        detalleTexto,
        tituloEspecies: 'Animales atendidos',
      }}
    />
  );
}
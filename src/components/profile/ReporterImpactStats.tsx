import React from 'react';
import { ImpactStatsBase } from './ImpactStatsBase';
import type { ImpactoReportante } from '../../hooks/useRecentReports';

interface Props {
  impacto: ImpactoReportante;
  isLoading: boolean;
}

function mensajeCalido(rescatados: number) {
  if (rescatados === 0) return 'Cada reporte que hagas puede salvar una vida.';
  if (rescatados === 1) return 'Gracias a tus reportes, 1 animalito ha sido rescatado.';
  return `Gracias a tus reportes, ${rescatados} animalitos han sido rescatados.`;
}

function detalleTexto(total: number, enProceso: number) {
  const base = `Has realizado ${total} ${total === 1 ? 'reporte' : 'reportes'} en total.`;
  if (enProceso === 0) return `${base} Todos tus casos ya se resolvieron.`;
  return `${base} Actualmente hay ${enProceso} ${enProceso === 1 ? 'caso' : 'casos'} en proceso de atención.`;
}

export function ReporterImpactStats({ impacto, isLoading }: Props) {
  return (
    <ImpactStatsBase
      impacto={impacto}
      isLoading={isLoading}
      copy={{
        roleLabel: 'Reportante en PawAlert',
        desdePrefijo: 'Miembro',
        mensajeCalido,
        detalleTexto,
        tituloEspecies: 'Animales reportados',
      }}
    />
  );
}
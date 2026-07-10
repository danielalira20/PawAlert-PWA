import React from 'react';
import { ImpactStatsBase } from './ImpactStatsBase';
import type { ImpactoAsociacion } from '../../hooks/useAssociationImpact';

interface Props {
  impacto: ImpactoAsociacion;
  isLoading: boolean;
}

function mensajeCalido(rescatados: number) {
  if (rescatados === 0) return 'Cada caso que atiendes puede salvar una vida.';
  if (rescatados === 1) return 'Gracias a tu asociación, 1 animalito ha sido rescatado.';
  return `Gracias a tu asociación, ${rescatados} animalitos han sido rescatados.`;
}

function detalleTexto(total: number, enProceso: number) {
  const base = `Tu asociación ha gestionado ${total} ${total === 1 ? 'reporte' : 'reportes'} en total.`;
  if (enProceso === 0) return `${base} Todos los casos ya se resolvieron.`;
  return `${base} Actualmente hay ${enProceso} ${enProceso === 1 ? 'caso' : 'casos'} en proceso de atención.`;
}

export function AssociationImpactStats({ impacto, isLoading }: Props) {
  return (
    <ImpactStatsBase
      impacto={impacto}
      isLoading={isLoading}
      copy={{
        roleLabel: 'Asociación en PawAlert',
        desdePrefijo: 'Activa',
        mensajeCalido,
        detalleTexto,
        tituloEspecies: 'Animales atendidos',
      }}
    />
  );
}
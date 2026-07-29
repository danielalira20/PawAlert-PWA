import type { CasoCercano } from '../../screens/NearbyCasesScreen';

interface NearbyCasesMapProps {
  casos: CasoCercano[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export declare function NearbyCasesMap(props: NearbyCasesMapProps): JSX.Element;

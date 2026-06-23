import { Scissors } from 'lucide-react';
import { LevelDropdown } from './LevelDropdown';
import { PONYTAIL_LEVELS } from '../lib/ponytail';

export function PonytailDropdown(props) {
    return (
        <LevelDropdown
            levels={PONYTAIL_LEVELS}
            icon={Scissors}
            label="Ponytail"
            title="Ponytail mode — code minimalism"
            {...props}
        />
    );
}

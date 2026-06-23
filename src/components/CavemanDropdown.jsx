import { Minimize2 } from 'lucide-react';
import { LevelDropdown } from './LevelDropdown';
import { CAVEMAN_LEVELS } from '../lib/caveman';

export function CavemanDropdown(props) {
    return (
        <LevelDropdown
            levels={CAVEMAN_LEVELS}
            icon={Minimize2}
            label="Caveman"
            title="Caveman mode — output compression"
            {...props}
        />
    );
}

import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/raleway/latin-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@kostad/brand/css';
import './style.css';
import { localizePage } from '@/shared/util';
import { PopupController } from './controller';
import { initReview } from './review';
import pkg from '../../package.json';

const version = pkg.version || 'X.X.X';

localizePage();
new PopupController(version).init();
void initReview();

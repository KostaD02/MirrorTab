import { PopupController } from './controller';
import './style.css';
import pkg from '../../package.json';

const version = pkg.version || 'X.X.X';

new PopupController(version).init();

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AvisosHost } from './shared/ui/avisos-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AvisosHost],
  template: `<router-outlet /><app-avisos-host />`,
})
export class App {}

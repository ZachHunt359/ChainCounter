import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { HttpClientModule, provideHttpClient, withFetch } from '@angular/common/http'; // Import HttpClientModule and withFetch
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    CommonModule,
    HttpClientModule 
  ],
  providers: [
    provideHttpClient(withFetch()) // Enable fetch for HttpClient
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
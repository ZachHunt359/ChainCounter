import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common'; // Import CommonModule

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true, // Mark this component as standalone
  imports: [CommonModule] // Add CommonModule to imports
})
export class AppComponent {
  selectedFile: File | null = null;
  results: any[] = [];
  
  constructor(private http: HttpClient) {}

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  onUpload() {
    if (!this.selectedFile) {
      alert('Please select a file first!');
      return;
    }

    const formData = new FormData();
    formData.append('file', this.selectedFile);

    this.http.post<any[]>('http://localhost:5000/upload', formData)
      .subscribe(
        response => this.results = response,
        error => alert('Error uploading file!')
      );
  }
}
